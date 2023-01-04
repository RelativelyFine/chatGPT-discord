import DiscordJS, { Intents } from "discord.js";
import { ChatGPTAPIBrowser } from "chatgpt";
import { Mutex } from "async-mutex";
import dotenv from "dotenv";
import crashData from "./crashData.json";
import fs from "fs";
dotenv.config();

type APIRes = {
  response: string;
  conversationId: string;
  messageId: string;
};

type responsePromise<T, F = any> = {
  catch<TResult = never>(
    onrejected?:
      | ((reason: F) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<T | TResult>;
} & Promise<T>;

const email: string = process.env.OPENAI_EMAIL!;
const password: string = process.env.OPENAI_PASSWORD!;
const guildId: string = process.env.GUILD_ID!;
const fakeAPI = new ChatGPTAPIBrowser({
  email,
  password,
  debug: false,
  minimize: false,
});
const mutex = new Mutex();
let res: APIRes;
let databank: string = "";

async function restartClient(text: string = "Hello!") {
  console.log("reauthentication ... Manual\n");
  await fakeAPI.closeSession();
  return await initial(text, false); // no initSession because sendMessage does it if needed.
}

async function initial(text: string = "Hello!", initial: boolean = true) {
  if (initial) {
    await fakeAPI.initSession();
  }
  const release = await mutex.acquire();
  try {
    if (crashData.conversationId !== undefined) {
      res = await fakeAPI.sendMessage(crashData.text, {
        conversationId: crashData.conversationId,
        parentMessageId: crashData.messageId,
        timeoutMs: 60 * 1000,
      });
    } else {
      res = await fakeAPI.sendMessage(text, {
        timeoutMs: 60 * 1000,
      });
    }
  } catch (error) {
    console.log(error);
    res.response = "*Amy is still masturbating... <@151266962247254016> help?*";
    setTimeout(() => {
      process.exit();
    }, 1000);
  } finally {
    release();
    if (crashData.DiscordChannelId != "") {
      const channel = client.channels.cache.get(crashData.DiscordChannelId);
      if (channel?.isText()) {
        channel.messages
          .fetch(crashData.DiscordMessageId)
          .then((returnedMessage) => {
            sendMessage(returnedMessage, res.response, crashData.text);
          });
      }
    }
  }
  return res.response;
}

async function askQuestion(
  input: string,
  userComment: DiscordJS.Message | DiscordJS.CommandInteraction
) {
  const response: responsePromise<string, string> = new Promise(
    async (resolve, reject) => {
      const release = await mutex.acquire();
      try {
        const t = setTimeout(async function () {
          reject(
            "*Amy is currently masturbating, try again in a couple minutes...*"
          );
        }, 2 * 60 * 1000);
        res = await fakeAPI.sendMessage(input, {
          conversationId: res.conversationId,
          parentMessageId: res.messageId,
        });
        clearTimeout(t);
        resolve(res.response);
      } finally {
        release();
      }
    }
  );
  let reply: string | undefined;

  await response
    .then((output) => {
      reply = output;
      crashData.DiscordChannelId = "";
      crashData.text = "";
      crashData.conversationId = "";
      crashData.messageId = "";
      const jsonString = JSON.stringify(crashData);
      fs.writeFile("./crashData.json", jsonString, (err: any) => {});
    })
    .catch((error) => {
      sendMessage(userComment, error, input);
      if (userComment instanceof DiscordJS.Message) {
        crashData.DiscordChannelId = userComment.channel.id;
        crashData.DiscordMessageId = userComment.id;
      } else {
        crashData.DiscordChannelId = userComment.channelId;
        crashData.DiscordMessageId = userComment.id;
      }
      crashData.text = input;
      crashData.conversationId = res.conversationId!;
      crashData.messageId = res.messageId!;
      const jsonString = JSON.stringify(crashData);
      fs.writeFile("./crashData.json", jsonString, (err: any) => {});
      setTimeout(() => {
        process.exit();
      }, 1000);
    });
  if (reply !== undefined) {
    sendMessage(userComment, reply, input);
  }
}

function sendMessage(
  userComment: DiscordJS.Message | DiscordJS.CommandInteraction,
  output: string,
  input: string = ""
) {
  if (userComment instanceof DiscordJS.Message) {
    userComment.reply({
      content: output.replace(/^["'](.+(?=["']$))["']$/, "$1").slice(0, 1940),
    });
  } else {
    userComment.editReply({
      content: `Question: ${input}\nAnswer: ${output
        .replace(/^["'](.+(?=["']$))["']$/, "$1")
        .slice(0, 1940)}`,
    });
  }
}

const client = new DiscordJS.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT,
  ],
});

client.on("ready", async (c) => {
  await initial();
  console.log(`Ready! Logged in as ${c.user.tag}`);
  const guild = client.guilds.cache.get(guildId);
  let commands;
  if (guild) {
    commands = guild.commands;
  } else {
    commands = client.application?.commands;
  }
  commands?.create({
    name: "ask",
    description: "Ask a question to Amy",
    options: [
      {
        name: "question",
        description: "The question you want to ask",
        type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        required: true,
      },
    ],
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === "ask") {
    const input = options.getString("question")!;
    await interaction.deferReply();
    askQuestion(input, interaction);
  }
});

client.on("messageCreate", async (message) => {
  const release = await mutex.acquire();
  try {
    if (
      message.author.bot ||
      message.content.includes("@here") ||
      message.content.includes("@everyone")
    ) {
      return;
    }
    if (message.channel.id == "881024547523031052") {
      databank = databank.concat(
        "\n\n" + message.author.username + " said:\n" + message.content
      );
    }
  } finally {
    release();
    if (databank.length > 3000 && message.channel.id == "881024547523031052") {
      askQuestion(
        databank +
          "\n\n\nWhat would a human respond like to this? Formulate a response only (short)! Human: \n",
        message
      );
      databank = "";
    } else if (message.reference) {
      const reply = await message.channel.messages.fetch(
        message.reference?.messageId!
      );
      if (reply.author.bot) {
        askQuestion(
          "\n\nAmy_V2 said:\n" +
            reply.content +
            "\n\n" +
            message.author.username +
            " said:\n" +
            message.content +
            "\n\n\nWhat would a human respond like to this? Formulate a response only(short)! Human: \n",
          message
        );
      }
    } else if (message.mentions.has(client.user!.id)) {
      askQuestion(
        "\n\n" +
          message.author.username +
          " said:\n" +
          message.content +
          "\n\n\nWhat would a human respond like to this? Formulate a response only (short)! Human: \n",
        message
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
