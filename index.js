const express = require("express");
const app = express();
const path = require("path");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth"); 

const port = 8080;


const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];


// label name to create
const labelName = "Vacation Auto-Reply";


// endpoint
app.get("/", async (req, res) => {


// authentication from google cloud
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"),
    scopes: SCOPES,
  });

  console.log("this is auth",auth)


// gmail authentication to get services and data
  const gmail = google.gmail({ version: "v1", auth });


  const response = await gmail.users.labels.list({
    userId: "me",
  });


// functionality for fetching the not replied mails from my inbox
  async function getUnrepliesMessages(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });
    
    return response.data.messages || [];
  }


// To create label if not exist if exists use same label
  async function createLabel(auth) {
    const gmail = google.gmail({ version: "v1", auth });

    // trying to create label
    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return response.data.id;
    } 

    catch (error) {
      // error -> 409  => label already existed
      if (error.code === 409) {
        const response = await gmail.users.labels.list({
          userId: "me",
        });
        const label = response.data.labels.find(
          (label) => label.name === labelName
        );
        return label.id;
      } 
      
      else {
        throw error;
      }
    }
  }

  async function main() {
    const labelId = await createLabel(auth);
    // console.log(`Label  ${labelId}`);

    // cycle will execute on every 45 to 120 seconds range (random)
    setInterval(async () => {
      const messages = await getUnrepliesMessages(auth);
      console.log("Unreply messages", messages);

      if (messages && messages.length > 0) {
        for (const message of messages) {
          const messageData = await gmail.users.messages.get({
            auth,
            userId: "me",
            id: message.id,
          });

          const email = messageData.data;
          const hasReplied = email.payload.headers.some(
            (header) => header.name === "In-Reply-To"
          );

          if (!hasReplied) {
            const replyMessage = {
              userId: "me",
              resource: {
                raw: Buffer.from(
                  `To: ${
                    email.payload.headers.find(
                      (header) => header.name === "From"
                    ).value
                  }\r\n` +
                    `Subject: Auto Reply: ${
                      email.payload.headers.find(
                        (header) => header.name === "Subject"
                      ).value
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `Thank you for your email. I am currently out of the office on vacation and will not be available to respond.\n
                    I appreciate your understanding and patience. I will do my best to respond to your email as soon as possible upon my return.\n`
                ).toString("base64"),
              },
            };

            //sending reply to message sender
            await gmail.users.messages.send(replyMessage);


            //removing and adding replied mail from inbox to particular label
            await gmail.users.messages.modify({
              auth,
              userId: "me",
              id: message.id,
              resource: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
              },
            });
          }
        }
      }
    }, 10 * 1000); // I changed to 10 seconds for reliability
    // Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000); for 45 seconds
  }


  
  main();
  res.json({ "Authentication Suceeded": auth });
});

app.listen(port, () => {
  console.log(`auto_email service is running on ${port}`);
});
