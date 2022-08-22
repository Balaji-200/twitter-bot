// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

import * as functions from "firebase-functions";
import {TwitterApi} from "twitter-api-v2";
import * as admin from "firebase-admin";

admin.initializeApp();

const dbref = admin.firestore().doc("tokens/auth");
const rtd = admin.database().ref();

const twitterClient = new TwitterApi({
  clientId: process.env.CLIENT_ID as string,
  clientSecret: process.env.CLIENT_SECRET as string,
});

const callbackURL = `${process.env.URL as string}/callback`;
const tweetURL = `${process.env.URL as string}/tweet`;

export const auth = functions.https.onRequest(async (request, response) => {
  const {url, codeVerifier, state} = twitterClient.
      generateOAuth2AuthLink(callbackURL, {scope: ["tweet.read",
        "tweet.write", "users.read", "offline.access"]});
  await dbref.set({codeVerifier, state});
  console.log(url);
  response.redirect(url);
});

export const callback = functions.https.onRequest(async (req, res) => {
  const {state} = req.query;
  const code = req.query.code as string;
  const snapshot = await dbref.get();
  const {codeVerifier, state: storedState} = snapshot.data()!;

  if (state != storedState) {
    res.status(400).send("Token Mismatch");
  }

  const {accessToken, refreshToken} = await
  twitterClient.loginWithOAuth2({code, codeVerifier, redirectUri: callbackURL});
  await dbref.set({accessToken, refreshToken});
  res.redirect(tweetURL);
});

export const tweet = functions.pubsub.schedule("every 2 minutes").
    timeZone("Asia/Kolkata")
    .onRun( async (context) => {
      const {refreshToken} = (await dbref.get()).data()!;
      const {client: refreshedClient, accessToken,
        refreshToken: newRefreshToken} =
    await twitterClient.refreshOAuth2Token(refreshToken);
      await dbref.set({accessToken, refreshToken: newRefreshToken});
      const led1 =  (await rtd.child("led1").get()).val();
      const led2 =  (await rtd.child("led2").get()).val();
      const slider =  (await rtd.child("slider").get()).val();
      const currentTime = new Date();
      const currentOffset = currentTime.getTimezoneOffset();
      const ISTOffset = 330; // IST offset UTC +5:30
      const ISTTime = new Date(currentTime.getTime() + 
      (ISTOffset + currentOffset)*60000);
      const {data} = await refreshedClient.v2.
      tweet(`LED 1 💡: ${led1}\nLED 2 💡: ${led2}\nSLider 🎚: ${slider}
      \n\n\nUpdated on ${ISTTime.toLocaleDateString()} - 
      ${ISTTime.toLocaleTimeString()}`);
      console.log(data);
    });

