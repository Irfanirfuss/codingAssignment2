const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const intializerDBRunAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running http localhost 3000");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};
intializerDBRunAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const autoHeader = request.headers["authorization"];
  if (autoHeader !== undefined) {
    jwtToken = autoHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;

        next();
      }
    });
  }
};
// 1
app.post("/register", async (request, response) => {
  const { name, username, password, gender } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO 
        user (name,username,password,gender) 
      VALUES 
        (
           
          '${name}',
          '${username}', 
          '${hashedPassword}',
          '${gender}'
        )`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
// 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//3
app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsFeed = `SELECT username,tweet,date_time AS dateTime
  FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${user_id}
  ORDER BY date_time DESC
  LIMIT 4 
  ;`;
  const dbResponse = await db.all(tweetsFeed);
  response.send(dbResponse);
});

//4

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { name, username, user_id, gender } = payload;
  const followingUser = `SELECT name FROM  user
    INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user_id}  
    `;
  const responseFollower = await db.all(followingUser);
  response.send(responseFollower);
});
//5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const followerUsers = `
    SELECT name FROM user 
    INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${user_id}
   
    `;
  const responseFollowing = await db.all(followerUsers);
  response.send(responseFollowing);
});

//6
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`;
  const responseTweets = await db.get(tweetQuery);

  const userFollowerQuery = `SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${user_id}
  `;
  const userFollower = await db.all(userFollowerQuery);
  if (
    userFollower.some(
      (item) => item.following_user_id === responseTweets.user_id
    )
  ) {
    console.log(responseTweets);
    console.log("------------");
    console.log(userFollower);
    const getTweetDetailsQuery = `SELECT tweet ,
   COUNT(DISTINCT(like.like_id)) AS likes,
   COUNT(DISTINCT(reply.reply_id)) AS replies,
   tweet.date_time AS dateTime
   FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
   WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollower[0].user_id}
   `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
//7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const likesFromTweetId = `SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
   INNER JOIN user ON user.user_id = like.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}`;
    const responseLikesTweetId = await db.all(likesFromTweetId);
    if (responseLikesTweetId.length !== 0) {
      let likes = [];
      const getNamesArray = (responseLikesTweetId) => {
        for (let item of responseLikesTweetId) {
          likes.push(item.username);
        }
      };
      getNamesArray(responseLikesTweetId);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//8
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const repliesFromTweetId = `SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}`;
    const responseTweetReplies = await db.all(repliesFromTweetId);
    if (responseTweetReplies !== 0) {
      let replies = [];
      const getNameArray = (responseTweetReplies) => {
        for (let item of responseTweetReplies) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNameArray(responseTweetReplies);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//9

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetQuery = `
    SELECT
        tweet.tweet AS tweet ,
        COUNT(DISTINCT(like.like_id)) AS likes ,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
         tweet.date_time AS dateTime
         FROM 
            user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id  INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE user.user_id = ${user_id}
            GROUP BY tweet.tweet_id
    `;
  const tweetDetails = await db.all(getTweetQuery);
  response.send(tweetDetails);
});
//10

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `INSERT INTO tweet (tweet,user_id)
  VALUES (
      '${tweet}',
      ${user_id}
  )
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const queryOfTheDelete = `SELECT * FROM tweet  WHERE tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId}`;

  const responseDeleteId = await db.all(queryOfTheDelete);
  if (responseDeleteId.length !== 0) {
    const deleteQuery = `
      DELETE FROM tweet 
      WHERE tweet.user_id =${user_id} AND tweet.tweet_id = ${tweetId} ;
      `;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
