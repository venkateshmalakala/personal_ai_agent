const { defineAgent } = require("@livekit/agents");

const agent = defineAgent({
    entry: async (ctx) => {
        console.log("Personal AI Agent started");

        await ctx.connect();

        console.log(`Connected to room: ${ctx.room.name}`);

        const participant = await ctx.waitForParticipant();

        console.log(
            `Participant joined: ${participant.identity}`
        );
    },
});

module.exports = agent;