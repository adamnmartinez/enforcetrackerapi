const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Client, Pool } = require('pg')
const { v4: uuidv4 } = require('uuid')
const geolib = require('geolib')
const nodemailer = require('nodemailer')
const cron = require('node-cron')
require('dotenv').config()

const { body, validationResult } = require("express-validator");
const { rateLimit } = require("express-rate-limit");

const SECRET_KEY = "randomsecretkey" // Generate strong security key and hide in ENV file
const app = express()

app.use(cors())
app.use(express.json())

// Rate Limiting
const initializeLimiter = (max, minutes) => {
    // Will send a 429 when the limiter is activated.
    return rateLimit({
        windowMs: minutes * 60000, // Window length, measured in miliseconds.
        max: max, // Number of allowed requests per window.
        message: { error: "Too many requests", message: "Too many requests, Please try again later" },
        standardHeaders: "draft-8"
    })
}

const registrationLimiter = initializeLimiter(15, 20)
const authLimiter = initializeLimiter(15, 30)
const pinCreateLimiter = initializeLimiter(60, 25)
const watcherCreateLimiter = initializeLimiter(60, 15)
const validateLimiter = initializeLimiter(60, 25)

const createUsernameChain = () =>
  body("username")
    .notEmpty()
    .withMessage("Username cannot be empty.")
    .isString()
    .withMessage("Username must be a string")
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be between 3 and 50 characters.")
    .matches(/^[a-zA-Z0-9\-_]+$/)
    .withMessage(
      "Username can only contain letters, numbers, underscores, and dashes.",
    );

const createPasswordChain = () =>
  body("password")
    .notEmpty()
    .withMessage("Password cannot be empty.")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 8, max: 50 })
    .withMessage("Password must be between 8 and 50 characters.")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter.")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter.")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number.")
    .matches(/[!?@#$%^&*_]/)
    .withMessage("Password must contain at least one special character.");

const createEmailChain = () =>
  body("email")
    .notEmpty()
    .withMessage("E-mail cannot be empty.")
    .isString()
    .withMessage("E-mail must be a string")
    .isLength({ max: 254 })
    .withMessage("E-mail cannot exceed 254 characters.")
    .matches(/^[a-zA-Z0-9._%+-]+@ucsc\.edu$/)
    .withMessage("Access restricted to UCSC students. E-mail must be a valid UCSC address.");

const PORT = 8000

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: {
        rejectUnauthorized: false,
    }
})

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass:  process.env.MAIL_PASS
  },
});

const sendVerifyEmail = async (vericode, recipient) => {
  try {
    const info = await transporter.sendMail({
      from: `"PinPoint Team" <${process.env.MAIL_USER}>`,
      to: recipient,
      subject: "Confirm your PinPoint account!",
      html: `Thank you for your interest in PinPoint! Click the link below to activate your account. <br/><br/> Click <a href=${process.env.HOSTNAME+"activate/"+vericode}>here</a> to activate.`,
    });

    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
  } catch (err) {
    console.error("Error while sending mail", err);
  }
}

const sendNotification = (expotoken, reptype, zonetype) => {
    try {
        fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                "host": "exp.host",
                "accept": "application/json",
                "accept-encoding": "gzip, deflate",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                "to": expotoken,
                "title": `${reptype}`,
                "body": `Unconfirmed ${reptype} spotted near your ${zonetype}`
            })
        })
    } catch (e) {
        console.log(`An error occured trying to send a notification with Expo token ${expotoken}`)
    }
}

const getTokenFromUser = async (uid) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);
        const user = result.rows[0];

        if (!user) {
            console.log("Could not get Expo token from user id")
            return
        } else {
            return user.expotoken
        }
    } catch (e) {
        console.log("Could not get token with user id, possible DB error.")
    }
}

const authToken = (req, res, next) => {
    const token = req.headers['authorization']

    if(!token){
        console.log("(AUTHTOKEN) No Token Found")
        return res.sendStatus(401)
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if(err){
            console.log("(AUTHTOKEN) Invalid Token")
            return res.sendStatus(403);
        }
        console.log(`(AUTHTOKEN) Validated User with token ${token}`)
        req.user = user;
        next();
    })
}

app.listen(PORT, async () => {
    console.log(`Server initalized on port ${PORT}`)
    await pool.connect()
    const res = await pool.query('SELECT $1::text as connected', ['Connection to postgres successful!']);
    console.log(res.rows[0].connected);
})

app.get("/", (req, res) => {
    return res.status(200).json({
        message: "PinPoint API server is running."
    })
})

//app.post("/api/login", authLimiter, createUsernameChain(), createPasswordChain(), async (req, res) => {

app.post("/api/login", async (req, res) => {
    const { username } = req.body
    const { password } = req.body
    const { expotoken } = req.body

    console.log("(LOGIN) Attempting login...")
    const inputErrors = validationResult(req)

    try {
        if (!inputErrors.isEmpty()) {
            console.log("[AUTH] User could not be authenticated. Bad Request.");
            return res.status(400).json({
                error: "Bad Request",
                message: `${inputErrors.array()[0].msg}`,
            });
        }

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user){
            console.log("(LOGIN) Invalid Credentials")
            return res.status(401).json({ error: "Invalid credentials"})
        }

        const PassValid = await bcrypt.compare(password, user.password)
        if(!PassValid){
            console.log("(LOGIN) Invalid Credentials")
            return res.status(401).json({ error: "Invalid credentials"})
        }

        console.log(`(LOGIN) Found user ${JSON.stringify(user)}`)
        const token = jwt.sign({ id: user.uid, username: user.username, email: user.gmail }, SECRET_KEY, {expiresIn: '1h'})

        console.log("(LOGIN) User Authenticated")
        console.log(`(LOGIN) Updating Expo Token: ${expotoken}`)

        await pool.query('UPDATE users SET expotoken = $1 WHERE uid = $2', [expotoken, user.uid]);

        if (!user.activated) {
            console.log("User not activate yet, cannot auth.")
            return res.status(403).json({ uid: user.uid, email: user.gmail, error: "Unactivated Account" })
        }

        console.log("(LOGIN) User authenticated.")
        return res.status(200).json({
            message: `Authenticated User! (${username})`,
            user: username,
            email: user.gmail,
            token: token
        })
    } catch (err) {
        console.error("(LOGIN) Database error:", err)
        return res.status(500).json({ err: "Internal Server Error" })
    }
})

app.post("/api/signup", registrationLimiter, createUsernameChain(), createPasswordChain(), createEmailChain(), async (req, res) => {
    const { email } = req.body
    const { username } = req.body
    const { password } = req.body

    console.log("(SIGNUP) Creating User...")
    const inputErrors = validationResult(req)

    try{
        if (!inputErrors.isEmpty()) {
            console.log("[AUTH] User could not be authenticated. Bad Request.");
            return res.status(400).json({
                error: "Bad Request",
                message: `${inputErrors.array()[0].msg}`,
            });
        }

        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username])

        if (existingUser.rows.length > 0){
            console.log(`(SIGNUP) Username Already Exists, Terminating...`)
            return res.status(409).json({ conflict: "username", error: "User account information already in use." })
        }

        const existingAddress = await pool.query('SELECT * FROM users WHERE gmail = $1', [email])

        if (existingAddress.rows.length > 0){
            console.log(`(SIGNUP) Email Already In Use, Terminating...`)
            return res.status(409).json({ conflict: "email", error: "User account information already in use." })
        }

        const hashPassword = await bcrypt.hash(password, 10) //hash password
        const user_id = uuidv4()

        await pool.query('INSERT INTO users (uid, gmail, username, password) VALUES ($1, $2, $3, $4)',
            [user_id, email, username, hashPassword]
        )

        await pool.query('INSERT INTO validity (uid) VALUES ($1)', [user_id])

        const vericode = uuidv4()
        await pool.query('INSERT INTO vericode (code, uid) VALUES ($1, $2)', [vericode, user_id])
        sendVerifyEmail(vericode, email)

        const token = jwt.sign({ id: user_id, username: username, email: email }, SECRET_KEY, {expiresIn: '1h'})

        console.log("(SIGNUP) User Created Successfully")

        return res.status(201).json({
            message: `Registering User... ${username}`,
            uid: user_id,
            user: username,
            email : email,
            token: token
        })
    } catch (err) {
        console.error("(SIGNUP) Database error:", err)
        return res.status(500).json({ err: "Internal Server Error" })
    }
})

app.get("/api/me", authToken, (req, res) => {
    console.log("(ME) Getting user data...")

    try{
        const user = req.user

        if(!user){
            console.log("(ME) User not found, terminating...")
            return res.sendStatus(404)
        }

        console.log(`(ME) User found: ${JSON.stringify(req.user)}`)
        return res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            expo: user.expotoken
        })
    } catch (err) {
        console.error("(ME) Database error:", err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
})

app.get("/api/ping", async (req, res) => {
    try {
        const db_res = await pool.query('SELECT NOW() as now');
        return res.status(200).json({ message: "Server Time Fetched.", data: db_res.rows })
    } catch (e) {
        return res.status(500).json({ message: "Could not communicate with database, internal server error."})
    }
})

app.get('/api/activate/:vid', async(req, res) => {
  const vid = req.params['vid']
  try {
    const db_res = await pool.query('SELECT * FROM vericode WHERE code = $1', [vid]);
    const data = db_res.rows[0]

    if (data) {
        await pool.query('UPDATE users SET activated=TRUE WHERE uid = $1', [data.uid])
        res.set('Content-Type', 'text/html')
        return res.status(200).send(Buffer.from(
            '<h2> PinPoint Account Activated! </h2> Thank you for registering for our app! <br/><br/> Return to the login page to sign in.'
        ))
    } else {
        console.log("Could not activate.")
        res.set('Content-Type', 'text/html')
        return res.status(404).send(Buffer.from(
            '<h2>Outdated Verification Code (404 Not Found)</h2> This code could not be found and was likely invalidated, please regenerate your verification e-mail using the login feature on the app and try again.'
        ))
    }
    
  } catch (e) {
    return res.status(500).json({ message: "Could not communicate with database, internal server error."})
  }
})

app.post('/api/regenerate-vericode', async (req, res) => {
    const { uid } = req.body
    const { email } = req.body

    try {
        const vericode = uuidv4()
        await pool.query('INSERT INTO vericode (code, uid) VALUES ($1, $2)', [vericode, uid])
        sendVerifyEmail(vericode, email)
        return res.status(201).json({ message: "Code regenerated and email sent" })
    } catch (e) {
        console.log("Could not regenerate.")
        console.log(e)
        return res.status(500).json({ message: "Could not regenerate.", error: e})
    }   
})

app.get("/api/fetchpins", async (req, res) => {
    try {
        const db_res = await pool.query('SELECT * FROM public_pins');
        console.log("(FETCHPINS) Fetching pins...")
        return res.status(200).json({ message: "Pins Fetched", pins: db_res.rows })
    } catch (e) {
        console.log("(FETCHPINS) Could not get pins")
        return res.status(500).json({ message: "Could not fetch pins, internal server error."})
    }
})

app.post("/api/fetchwatchers", async (req, res) => {
    const { uid } = req.body

    try {
        const db_res = await pool.query('SELECT * FROM private_pins WHERE uid = $1', [ uid ]);
        console.log("(FETCHWATCHERS) Fetching watch zones...")
        return res.status(200).json({ message: "Watchers Fetched", pins: db_res.rows })
    } catch (e) {
        console.log("(FETCHWATCHERS) Could not get watch zones")
        console.log(` - ${e}`)
        return res.status(500).json({ message: "Could not fetch watch zones, internal server error."})
    }
})

// ONLY FOR DEBUGGING - DELETE ME
app.get("/api/userfetch", async (req, res) => {
    try {
        const db_res = await pool.query('SELECT * FROM users');
        console.log("(USERFETCH) Fetching pins...")
        return res.status(200).json({ message: "Users Fetched", users: db_res.rows })
    } catch (e) {
        console.log("(USERFETCH) Could not get users")
        return res.status(500).json({ message: "Could not fetch users, internal server error."})
    }
})


app.post("/api/pushpin", pinCreateLimiter, async (req, res) => {
    const { category } = req.body
    const { longitude } = req.body
    const { latitude } = req.body
    const { author_id } = req.body

    try {
        const query = {
            text: 'INSERT INTO public_pins (pid, uid, category, longitude, latitude, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
            values: [uuidv4(), author_id, category, parseFloat(longitude), parseFloat(latitude), new Date().toISOString()]
        }
        const db_res = await pool.query(query)
        const watch = await pool.query('SELECT * FROM private_pins') //fetch watchpoints
        const privatePins = watch.rows
        const currPoint = { latitude : parseFloat(latitude), longitude : parseFloat(longitude)}

        const nearby = privatePins.filter(pin => {
            const pinPoint = {
                latitude : parseFloat(pin.latitude),
                longitude : parseFloat(pin.longitude)
            }
            const distance = geolib.getDistance(currPoint, pinPoint)
            return distance <= pin.radius;
        })

        if(nearby.length > 0){
            console.log(`(WATCHPOINT) ${nearby.length} nearby private pins within zone radius:`)

            // TODO: Instead of console logging, send a notification.
            nearby.forEach(pin => {
                console.log(`[PID: ${pin.pid}] (${pin.latitude}, ${pin.longitude}) for user ${pin.uid}`)
                getTokenFromUser(pin.uid).then((token) => {
                    sendNotification(token, category, pin.category)
                })

            })
        }
        console.log("(PUSHPIN) Pin Uploaded.")
        return res.status(201).json({ message: "Pin Uploaded" })
    } catch (e) {
        console.log("(PUSHPIN) Could not upload pin")
        console.log(e)
        return res.status(500).json({ message: "Could not upload, internal server error.", error: e})
    }
})


app.post("/api/deletepin", async (req, res) => {
  const { pid, uid } = req.body;

  try {
    const db_res = await pool.query(
      "DELETE FROM public_pins WHERE pid = $1 AND uid = $2",
      [pid, uid]
    );

    if (db_res.rowCount === 0) {
      return res.status(403).json({ message: "You are not authorized to delete this pin." });
    }

    return res.status(200).json({ message: "Pin Deleted" });

  } catch (e) {
    return res.status(500).json({
      message: "Could not delete pin, internal server error.",
      error: e
    });
  }
});

app.post("/api/pushwatcher", watcherCreateLimiter, async (req, res) => {
    const { category } = req.body
    const { longitude } = req.body
    const { latitude } = req.body
    const { author_id } = req.body
    const { radius } = req.body

    try {
        const watcherCountQuery = {
            text: 'SELECT * FROM private_pins WHERE uid = $1',
            values: [author_id]
        }

        const query = {
            text: 'INSERT INTO private_pins (pid, uid, category, longitude, latitude, timestamp, radius) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            values: [uuidv4(), author_id, category, parseFloat(longitude), parseFloat(latitude), new Date().toISOString(), radius]
        }

        const watcher_res = await pool.query(watcherCountQuery)

        if (watcher_res.rowCount >= 2) {
            console.log("(PUSHWATCHER) Too many watch zones.")
            return res.status(403).json({ message: "Users are restricted to two watch zones per account." })
        } else {
            const db_res = await pool.query(query);
            console.log(`(PUSHWATCHER) Uploading user watch zone...`)
            return res.status(201).json({ message: "Watch Zone Uploaded" })
        }
    } catch (e) {
        console.log("(PUSHWATCHER) Could not upload watch zone")
        console.log(e)
        return res.status(500).json({ message: "Could not upload, internal server error.", error: e})
    }
})

app.post("/api/deletewatcher", async (req, res) => {
    const { pid } = req.body

    try {
        const db_res = await pool.query("DELETE FROM private_pins WHERE pid = $1", [pid]);
        console.log(`(DELETEWATCHER) Deleting watcher (pid: ${pid})...`)
        return res.status(200).json({ message: "Pin Deleted" })
    } catch (e) {
        console.log("(DELETEWATCHER) Could not delete pin")
        return res.status(500).json({ message: "Could not delete pin, internal server error.", error: e})
    }
})

app.post('/api/validates/add', validateLimiter, async(req, res) =>{
  const { user }  = req.body
  const { pin } = req.body
  try{
    const query = {
      text: "UPDATE validity SET endorsed_pins = endorsed_pins || ARRAY[$1] WHERE uid = $2",
      values: [pin, user]
    }
    const db_res = await pool.query(query);
    console.log("(VALIDATES/ADD) Pin Endorsed.")
    return res.status(200).json({ message: "Endorsed pin" });
  }catch (e){
    console.log("Unable to complete request")
    console.log(e)
    return res.status(500).json({ message: "internal server error.", error: e})
  }
})

app.post('/api/validates/delete', async(req, res) =>{
  const { user }  = req.body
  const { pin } = req.body

  try{
    console.log("Sending remove pin request");
    const query = {
      text: 'UPDATE validity SET endorsed_pins = array_remove(endorsed_pins, $1) WHERE uid = $2',
      values: [pin, user]
    }
    const db_res = await pool.query(query);
    return res.status(200).json({ message: "Unendorsed Pin" });
  }catch (e){
    console.log(e)
    return res.status(500).json({ message: "internal server error.", error: e})
  }
})

app.post("/api/validates/getvalidated", async (req, res) => {
    const { user } = req.body

    try {
        const db_res = await pool.query('SELECT * FROM validity WHERE uid = $1', [user]);
        // isValidated = db_res.rows[0].endorsed_pins.includes(pin)
        return res.status(200).json({ validated: db_res.rows[0].endorsed_pins})

    } catch (e) {
        return res.status(500).json({ message: "Could check validity, internal server error.", error: e})
    }
})

app.post("/api/validates/getscore", async (req, res) => {
    const { pin } = req.body

    try {
        const db_res = await pool.query('SELECT * FROM validity WHERE $1 = ANY(endorsed_pins)', [pin]);
        return res.status(200).json({ score: db_res.rows.length })

    } catch (e) {
        return res.status(500).json({ message: "Could check validity, internal server error.", error: e})
    }
})

app.post("/api/validates/peek", async (req, res) => {
    const db_res = await pool.query('SELECT * FROM validity');
    console.log(db_res.rows)
    return res.status(200).json({ rows: db_res.rows })
})

async function deleteOldRecords(tableName) {
  try {
    const result = await pool.query(
      `DELETE FROM ${tableName} WHERE timestamp < NOW() - INTERVAL '24 hours';`
    );
    console.log(`[CLEANUP] Deleted ${result.rowCount} old records from ${tableName}.`);
  } catch (err) {
    console.error(`[CLEANUP ERROR - ${tableName}]`, err);
  }
}

async function deleteUnvalidated(tableName, timeInterval){
  try{
    const result = await pool.query(`DELETE FROM ${tableName}
      WHERE timestamp < NOW() - INTERVAL '${timeInterval}' AND likes = 0;`);
    console.log(`Deleting unvalidated pins. { ${result.rowCount} deleted from ${tableName} }`);

  }catch(err){
    console.error(`[UNVALIDATED CLEANUP ERROR - ${tableName}]`, err);
  }
}

cron.schedule('0 * * * *', () => {
  console.log('[CRON] Running scheduled public pin cleanup...');
  deleteOldRecords('public_pins');
  deleteUnvalidated('public_pins', '4 hours');
});
