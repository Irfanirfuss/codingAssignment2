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

const authaneticToken = (request, response, next) => {
  let jwtToken;
  const autoHeader = request.headers["authorization"];
  if (autoHeader !== undefined) {
    jwtToken = autoHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(400);
    response.send("Invalid jwt token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(400);
        response.send("Invalid Jwt Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
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
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const gettingResultOfUsers = (dbObject) => {
  return {
    name: dbObject.name,
  };
};
const gettingResultsOfUsersTweets = (dbObject) => {
  return {
    userName: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};
const gettingTweetsFromUser = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.like,
    replies: dbObject.reply,
    dateTime: dbObject.date_time,
  };
};
const gettingLikesFRomTweetIdm = (dbObject) => {
  return {
    likes: dbObject.name,
  };
};

//3
app.get("/user/tweets/feed/", authaneticToken, async (request, response) => {
  const tweetsFeed = `SELECT username,tweet,date_time
  FROM tweet NATURAL JOIN USER 
  LIMIT 4 
  `;
  const dbResponse = await db.all(tweetsFeed);
  response.send(gettingResultOfUsers(dbResponse));
});

//4

app.get("/user/following/", authaneticToken, async (request, response) => {
  const followingUser = `SELECT name FROM  user
    NATURAL JOIN follower
    WHERE following_user_id = user_id
    
    `;
  const responseFollower = await db.all(followingUser);
  response.send(responseFollower.map((each) => gettingResultOfUsers(each)));
});
//5
app.get("/user/followers/", authaneticToken, async (request, response) => {
  const followerUsers = `
    SELECT name FROM user 
    NATURAL JOIN follower
    WHERE follower_user_id = user_id
    GROUP BY name
    `;
  const responseFollowing = await db.all(followerUsers);
  response.send(responseFollowing.map((each) => gettingResultOfUsers(each)));
});

//6
app.get("/tweets/:tweetId/", authaneticToken, async (request, response) => {
  const { TweetId } = request.body;
  const tweetsFromFollower = `SELECT tweet ,COUNT(likes),reply AS replies,date_time AS dateTime
  FROM tweet INNER JOIN follower WHERE tweet_id =  following_user_id`;
  const responseTweets = await db.get(tweetsFromFollower);
  if (responseTweets === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(gettingTweetsFromUser(responseTweets));
  }
});
//7
app.get(
  "/tweets/:tweetId/likes/",
  authaneticToken,
  async (request, response) => {
    const { tweetId } = request.body;
    const likesFromTweetId = `SELECT name AS likes FROM like  INNER JOIN JOIN tweet.tweet_id ON user.user_id  
    WHERE tweet_id = '${tweetId}'`;
    const responseLikesTweetId = await db.get(likesFromTweetId);
    if (responseLikesTweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(
        responseLikesTweetId.map((each) => gettingLikesFRomTweetIdm(each))
      );
    }
  }
);

//8
app.get(
  "/tweets/:tweetId/replies/",
  authaneticToken,
  async (request, response) => {
    const { tweetId } = request.body;
    const repliesFromTweetId = `SELECT name ,reply FRom user INNER JOIN tweet ON tweet.tweet_id =  user.user_id
    INNER JOIN follower ON follower.follower_id = user.user_id
    INNER JOIN reply ON reply.reply_id = tweet.tweet_id
    WHERE tweet_id = '${tweetId}'`;
    const responseTweetReplies = await db.all(repliesFromTweetId);
    if (responseTweetReplies === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(responseTweetReplies);
    }
  }
);

//9

app.get("/user/tweets/", async (request, response) => {
  const tweetsFromUser = `SELECT tweet , COUNT(like_id) AS likes, COUNT(reply) AS replies, date_time AS dateTime
    FROM tweet  INNER JOIN like  ON like.user_id = tweet.tweet_id
   NATURAL JOIN  reply ON reply.user_id = tweet.tweet_id 
    `;
  const responseTweets = await db.all(tweetsFromUser);
  response.send(
    responseTweets.map((each) => [gettingTweetsFromUser(responseTweets)])
  );
});
//10

app.post("/user/tweets/", authaneticToken, async (request, response) => {
  const queryOfPost = `CREATE tweet from tweet INNER JOIN user ON user.user_id = tweet.user_id
    `;
  const responseOfPost = await db.run(queryOfPost);
  response.send("Created a Tweet");
});

//11
app.delete("/tweets/:tweetId/", authaneticToken, async (request, response) => {
  const { deleteId } = request.body;
  const queryOfTheDelete = `DELETE tweet FROM tweet 
    WHERE tweet_id = '${deleteId}`;
  const responseDeleteId = await db.run(queryOfTheDelete);
  response.send("Tweet Removed");
});

module.exports = app;
