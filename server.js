const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Client, Pool } = require('pg')
const { v4: uuidv4 } = require('uuid')
const geoli = require('geolib')
require('dotenv').config()

const SECRET_KEY = "randomsecretkey" // Generate strong security key and hide in ENV file
const app = express()

app.use(cors())
app.use(express.json())

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

app.post("/api/login", async (req, res) => {
    const { username } = req.body
    const { password } = req.body
    const { expotoken } = req.body

    console.log("(LOGIN) Attempting login...")

    try {
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
        
        const expoTokenPushRes = await pool.query('UPDATE users SET expotoken = $1 WHERE uid = $2', [expotoken, user.uid]);

        return res.status(200).json({
            message: `Authenticated User! (${username})`,
            user: username,
            token: token
        })
    } catch (err) {
        console.error("(LOGIN) Database error:", err)
        return res.status(500).json({ err: "Internal Server Error" })
    }   
})

app.post("/api/signup", async (req, res) => {
    const { email } = req.body
    const { username } = req.body
    const { password } = req.body

    console.log("(SIGNUP) Creating User...")

    if(!email || !username || !password){
        console.log("(SIGNUP) Bad Request, Some Fields Not Provided")
        return res.status(400).json({ error: "Missing field" })
    }

    try{
        const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username])
        if(existing.rows.length > 0){
            console.log("(SIGNUP) User Exists, Terminating...")
            return res.status(409).json({ error: "Username already exists" })
        }

        const hashPassword = await bcrypt.hash(password, 10) //hash password
        const user_id = parseInt(Math.random() * 10000);

        await pool.query(' INSERT INTO users (uid, gmail, username, password) VALUES ($1, $2, $3, $4)', 
            [user_id, email, username, hashPassword]
        )

        const token = jwt.sign({ id: user_id, username: username, email: email }, SECRET_KEY, {expiresIn: '1h'})

        console.log("(SIGNUP) User Created:")

        return res.status(201).json({
            message: `Registering User... ${username}`,
            user: username,
            email : email,
            token: token
        })
    } catch (err) {
        console.error("(SIGNUP) Database error:", err)
        return res.status(500).json({ err: "Internal Server Error" })
    } 
})

function authToken(req, res, next){
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
            email: user.email
        })
    } catch (err) {
        console.error("(ME) Database error:", err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
})

app.get("/api/dbtest", async (req, res) => {
    try {
        const db_res = await pool.query('SELECT NOW() as now');
        return res.status(200).json({ message: "Server Time Fetched.", data: db_res.rows })
    } catch (e) {
        return res.status(500).json({ message: "Could not communicate with database, internal server error."})
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
        console.log(db_res.rows)
        return res.status(200).json({ message: "Users Fetched", users: db_res.rows })
    } catch (e) {
        console.log("(USERFETCH) Could not get users")
        return res.status(500).json({ message: "Could not fetch users, internal server error."})
    }
})


app.post("/api/pushpin", async (req, res) => {
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
        console.log(`(PUSHPIN) Uploading pin...`)
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
            console.log(`(WATCHPOINT) ${nearby.length} nearby private pins within 100m:`)
            nearby.forEach(pin => {
                console.log(`[PID: ${pin.pid}] (${pin.latitude}, ${pin.longitude}) for user ${pin.uid}`)
            })
        }
        return res.status(201).json({ message: "Pin Uploaded" })
    } catch (e) {
        console.log("(PUSHPIN) Could not upload pin") 
        console.log(e)
        return res.status(500).json({ message: "Could not upload, internal server error.", error: e})
    }
})


app.post("/api/deletepin", async (req, res) => {
    const { pid } = req.body

    try {
        const db_res = await pool.query("DELETE FROM public_pins WHERE pid = $1", [pid]);
        console.log(`(DELETEPIN) Deleting pin (pid: ${pid})...`)
        return res.status(200).json({ message: "Pin Deleted" })
    } catch (e) {
        console.log("(DELETEPIN) Could not delete pin")
        return res.status(500).json({ message: "Could not delete pin, internal server error.", error: e})
    }
})

app.post("/api/pushwatcher", async (req, res) => {
    const { category } = req.body
    const { longitude } = req.body
    const { latitude } = req.body
    const { author_id } = req.body

    try {
        const query = {
            text: 'INSERT INTO private_pins (pid, uid, category, longitude, latitude, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
            values: [uuidv4(), author_id, category, parseFloat(longitude), parseFloat(latitude), new Date().toISOString()]
        }
        const db_res = await pool.query(query);
        console.log(`(PUSHWATCHER) Uploading user watch zone...`)
        return res.status(201).json({ message: "Watch Zone Uploaded" })
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