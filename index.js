require("dotenv").config();

const OpenAI = require("openai");
const readline = require("readline");

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

async function chat(userMessage) {

    conversation.push({
        role: "user",
        content: userMessage
    });

    try {

        const response = await client.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: conversation
        });

        const reply = response.choices[0].message.content;

        conversation.push({
            role: "assistant",
            content: reply
        });

        console.log("\nAI:", reply);

    } catch (error) {
        console.log("\nERROR:", error.message);
    }
}

function startChat() {

    rl.question("\nYou: ", async (message) => {

        if (message.toLowerCase() === "exit") {
            console.log("Goodbye!");
            rl.close();
            return;
        }

        await chat(message);

        startChat();
    });
}

console.log("================================");
console.log("   Venkatesh AI Assistant");
console.log("================================");
console.log("Type 'exit' to stop.");

startChat();