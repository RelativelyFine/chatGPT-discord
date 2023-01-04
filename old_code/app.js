import {
  InteractionResponseType,
  InteractionType,
} from 'discord-interactions'
import 'dotenv/config'
import express from 'express'

import {
  ASK_COMMAND,
  HasGuildCommands,
  TEST_COMMAND
} from './commands.js'
import {
  VerifyDiscordRequest,
  getRandomEmoji
} from './utils.js'

import { oraPromise } from 'ora'
import { ChatGPTAPIBrowser } from 'chatgpt'

const email = process.env.OPENAI_EMAIL
  const password = process.env.OPENAI_PASSWORD

  const fakeAPI = new ChatGPTAPIBrowser({
    email,
    password,
    debug: false,
    minimize: true,
  })

await fakeAPI.initSession()

async function verifySession() {
  if (!fakeAPI.getIsAuthenticated()) {
    await fakeAPI.refreshSession().catch((error) => {
      console.error(error)
      fakeAPI.resetSession()
    })
  }
  else {
    console.log("session verified")
  }
} 

async function getResponse() {
  
  let input = "hello how are you?"

  const output = await oraPromise(fakeAPI.sendMessage(input), {
    text: input
  })

  console.log(output.response)

  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      // Fetches a random emoji to send from a helper function
      content: output.response
    }
  }

} 



// Create an express app
const app = express()
// Get port, or default to 3000
const PORT = process.env.PORT || 3000
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }))

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG })
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data

    // "test" guild command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      await verifySession()
      res.send(getResponse())
    }
    // "ask" guild command
    if (name === 'ask') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: 'hello world ' + getRandomEmoji()
        }
      })
    }
  }
})



app.listen(PORT, () => {
  console.log('Listening on port', PORT)

  // Check if guild commands from commands.js are installed (if not, install them)
  HasGuildCommands(process.env.APP_ID, process.env.GUILD_ID, [
    TEST_COMMAND,
    ASK_COMMAND
  ])
})
