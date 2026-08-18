require("dotenv").config();

const OpenAI = require("openai");
const { MongoClient } = require("mongodb");
const readline = require("readline");

// --------------------
// Groq AI
// --------------------

const ai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

// --------------------
// MongoDB
// --------------------

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let conversations;

// --------------------
// Terminal
// --------------------

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// --------------------
// Connect MongoDB
// --------------------

async function connectDatabase() {

    console.log("Connecting to MongoDB...");

    await mongoClient.connect();

    const database = mongoClient.db("personal_ai_agent");

    conversations = database.collection("conversations");

    console.log("MongoDB connected successfully ✅");
}

// --------------------
// Conversation
// --------------------

const conversation = [
    {
        role: "system",
        content: `
You are Venkatesh's personal phone assistant.

Your job is to answer callers politely and naturally.

Rules:
1. Be friendly and concise.
2. If Venkatesh is unavailable, offer to take a message.
3. Ask for the caller's name when appropriate.
4. Ask why they are calling.
5. Never invent information about Venkatesh.
6. Never reveal private information.
7. If you don't know something, say Venkatesh will get back to them.
8. Keep responses short because this will eventually be used for phone calls.
`
    }
];

// --------------------
// Chat with AI
// --------------------

async function chat(userMessage) {

    conversation.push({
        role: "user",
        content: userMessage
    });

    try {

        const response = await ai.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: conversation
        });

        const reply = response.choices[0].message.content;

        conversation.push({
            role: "assistant",
            content: reply
        });

        console.log("\nAI:", reply);

        // Save conversation to MongoDB
        await conversations.insertOne({
            userMessage: userMessage,
            aiResponse: reply,
            timestamp: new Date()
        });

        console.log("Saved to MongoDB ✅");

    } catch (error) {

        console.log("\nERROR:", error.message);

    }
}

// --------------------
// Start Chat
// --------------------

function startChat() {

    rl.question("\nYou: ", async (message) => {

        if (message.toLowerCase() === "exit") {

            console.log("Goodbye!");

            await mongoClient.close();

            rl.close();

            return;
        }

        await chat(message);

        startChat();
    });
}

// --------------------
// Main
// --------------------

async function main() {

    try {

        await connectDatabase();

        console.log("\n================================");
        console.log("   Venkatesh AI Assistant");
        console.log("================================");
        console.log("Type 'exit' to stop.");

        startChat();

    } catch (error) {

        console.log("MongoDB connection error:");
        console.log(error.message);

    }
}

main();