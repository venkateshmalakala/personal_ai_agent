require("dotenv").config();

const OpenAI = require("openai");
const { MongoClient } = require("mongodb");
const readline = require("readline");

// ====================
// GROQ AI
// ====================

const ai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

// ====================
// MONGODB
// ====================

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let callersCollection;
let callsCollection;

// ====================
// TERMINAL
// ====================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

// ====================
// CONNECT DATABASE
// ====================

async function connectDatabase() {
    console.log("Connecting to MongoDB...");

    await mongoClient.connect();

    const database = mongoClient.db("personal_ai_agent");

    callersCollection = database.collection("callers");
    callsCollection = database.collection("calls");

    console.log("MongoDB connected successfully ✅");
}

// ====================
// GET CALLER
// ====================

async function getCaller() {

    const phoneNumber = await askQuestion(
        "\nEnter caller phone number: "
    );

    let caller = await callersCollection.findOne({
        phoneNumber: phoneNumber
    });

    if (caller) {

        console.log(
            `\nWelcome back, ${caller.name || "caller"}! 👋`
        );

        console.log(
            `Previous calls found: ${caller.totalCalls || 0}`
        );

    } else {

        console.log("\nNew caller detected 📞");

        caller = {
            phoneNumber: phoneNumber,
            name: null,
            firstContact: new Date(),
            lastContact: new Date(),
            totalCalls: 0
        };

        await callersCollection.insertOne(caller);
    }

    return caller;
}

// ====================
// GET PREVIOUS CALLS
// ====================

async function getPreviousContext(phoneNumber) {

    const previousCalls = await callsCollection
        .find({
            phoneNumber: phoneNumber
        })
        .sort({
            endedAt: -1
        })
        .limit(3)
        .toArray();

    if (previousCalls.length === 0) {
        return "";
    }

    return previousCalls
        .map((call, index) => {

            return `
Previous Call ${index + 1}:

Caller Name: ${call.callerName || "Unknown"}

Reason:
${call.reason || "Unknown"}

Message:
${call.message || "None"}

Summary:
${call.summary || "No summary available"}
`;

        })
        .join("\n");
}

// ====================
// CALL VARIABLES
// ====================

let conversation = [];
let transcript = [];
let callStartedAt;
let currentCaller;

// ====================
// CHAT WITH AI
// ====================

async function chat(userMessage) {

    conversation.push({
        role: "user",
        content: userMessage
    });

    transcript.push({
        role: "caller",
        message: userMessage,
        timestamp: new Date()
    });

    try {

        const response =
            await ai.chat.completions.create({

                model: "openai/gpt-oss-20b",

                messages: conversation
            });

        const reply =
            response.choices[0]
                .message
                .content;

        conversation.push({
            role: "assistant",
            content: reply
        });

        transcript.push({
            role: "assistant",
            message: reply,
            timestamp: new Date()
        });

        console.log("\nAI:", reply);

    } catch (error) {

        console.log(
            "\nAI ERROR:",
            error.message
        );
    }
}

// ====================
// EXTRACT CALL DETAILS
// ====================

async function extractCallDetails() {

    const transcriptText =
        transcript
            .map(
                item =>
                    `${item.role}: ${item.message}`
            )
            .join("\n");

    const extractionPrompt = `
Analyze this phone conversation.

Return ONLY valid JSON.

Conversation:

${transcriptText}

Return exactly:

{
  "callerName": null,
  "reason": null,
  "message": null,
  "callbackRequested": false,
  "summary": "short summary"
}

Rules:

- Do not invent information.
- Use null when information is unavailable.
- callbackRequested must be true or false.
- summary should be short.
- Return ONLY JSON.
`;

    try {

        const response =
            await ai.chat.completions.create({

                model: "openai/gpt-oss-20b",

                messages: [
                    {
                        role: "user",
                        content: extractionPrompt
                    }
                ]
            });

        const result =
            response.choices[0]
                .message
                .content;

        return JSON.parse(result);

    } catch (error) {

        console.log(
            "\nExtraction error:",
            error.message
        );

        return {
            callerName: null,
            reason: null,
            message: null,
            callbackRequested: false,
            summary: "No summary available"
        };
    }
}

// ====================
// SAVE CALL
// ====================

async function saveCall() {

    if (transcript.length === 0) {
        return;
    }

    console.log(
        "\nAnalyzing conversation..."
    );

    const details =
        await extractCallDetails();

    await callsCollection.insertOne({

        phoneNumber:
            currentCaller.phoneNumber,

        callerName:
            details.callerName,

        reason:
            details.reason,

        message:
            details.message,

        callbackRequested:
            details.callbackRequested,

        summary:
            details.summary,

        transcript:
            transcript,

        startedAt:
            callStartedAt,

        endedAt:
            new Date()
    });

    // Update caller profile

    await callersCollection.updateOne(

        {
            phoneNumber:
                currentCaller.phoneNumber
        },

        {
            $set: {

                name:
                    details.callerName ||
                    currentCaller.name,

                lastContact:
                    new Date()

            },

            $inc: {
                totalCalls: 1
            }
        }
    );

    console.log(
        "\nComplete call saved to MongoDB ✅"
    );

    console.log(
        "\nCALL DETAILS:"
    );

    console.log(details);
}

// ====================
// START CHAT
// ====================

function startChat() {

    rl.question(
        "\nCaller: ",

        async (message) => {

            if (
                message
                    .toLowerCase()
                    .trim() === "exit"
            ) {

                await saveCall();

                console.log(
                    "\nCall ended 📞"
                );

                await mongoClient.close();

                rl.close();

                return;
            }

            await chat(message);

            startChat();
        }
    );
}

// ====================
// MAIN
// ====================

async function main() {

    try {

        await connectDatabase();

        console.log(
            "\n================================"
        );

        console.log(
            "   Venkatesh AI Phone Assistant"
        );

        console.log(
            "================================"
        );

        // Get caller

        currentCaller =
            await getCaller();

        // Check previous calls

        const previousContext =
            await getPreviousContext(
                currentCaller.phoneNumber
            );

        const isReturningCaller =
            currentCaller.totalCalls > 0;

        callStartedAt =
            new Date();

        // Create AI context

        conversation = [

            {
                role: "system",

                content: `
You are Venkatesh's personal AI phone assistant.

Your job is to speak naturally with callers.

IMPORTANT RULES:

1. Be friendly and concise.

2. If this is a returning caller, recognize them naturally.

3. Do NOT ask for the caller's name again if their name is already known.

4. Use previous conversation information when relevant.

5. Ask what they need help with today.

6. Never reveal private information about Venkatesh.

7. Never invent information.

8. Keep responses short because this will eventually be used for real phone conversations.

CALLER INFORMATION:

Name:
${currentCaller.name || "Unknown"}

Phone Number:
${currentCaller.phoneNumber}

Returning Caller:
${isReturningCaller ? "YES" : "NO"}

PREVIOUS CALL HISTORY:

${previousContext || "No previous calls found."}

If this is a returning caller, remember their previous context.

Do not pretend the current call is the same conversation as the previous call.

Continue naturally and use previous information only when relevant.
`
            }
        ];

        console.log(
            "\nType 'exit' to end the call."
        );

        // Automatic greeting

        if (isReturningCaller) {

            let greeting;

            if (currentCaller.name) {

                greeting =
                    `Hi ${currentCaller.name}, welcome back! How can I help you today?`;

            } else {

                greeting =
                    "Hi, welcome back! How can I help you today?";
            }

            console.log(
                "\nAI:",
                greeting
            );

            // Add greeting to conversation memory

            conversation.push({
                role: "assistant",
                content: greeting
            });

            transcript.push({
                role: "assistant",
                message: greeting,
                timestamp: new Date()
            });

        } else {

            const greeting =
                "Hello! You've reached Venkatesh's personal assistant. How can I help you?";

            console.log(
                "\nAI:",
                greeting
            );

            conversation.push({
                role: "assistant",
                content: greeting
            });

            transcript.push({
                role: "assistant",
                message: greeting,
                timestamp: new Date()
            });
        }

        startChat();

    } catch (error) {

        console.log(
            "\nERROR:"
        );

        console.log(
            error.message
        );

        await mongoClient.close();
    }
}

main();