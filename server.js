const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Client, Pool } = require('pg')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

const SECRET_KEY = "randomsecretkey" // Generate strong security key and hide in ENV file
const app = express()

app.use(cors())
app.use(express.json())

const PORT = 8000

const users = []; //change with database connection

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

    const user = users.find(u => u.username === username) //TODO: replace with DB query
    if (!user){
        return res.status(401).json({ error: "Invalid credentials"})
    }
    
    const PassValid = await bcrypt.compare(password, user.password)
    if(!PassValid){
        return res.status(401).json({ error: "Invalid credentials"})
    }

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, SECRET_KEY, {expiresIn: '1h'})
    
    return res.status(200).json({
        message: `Authenticated User! (${username})`,
        user: username,
        token: token
    })
})

app.post("/api/signup", async (req, res) => {
    const { email } = req.body
    const { username } = req.body
    const { password } = req.body

    if(!email || !username || !password){
        return res.status(400).json({ error: "Missing field" })
    }

    if(users.find(u => u.username === username)){ //TODO: Replace with DB lookup
        return res.status(409).json({ error: "Username already exist" })
    }

    const hashPassword = await bcrypt.hash(password, 10) //hash password

    const user = {
        id: uuidv4(),
        email: email, 
        username: username,
        password: hashPassword
    }

    users.push(user) // Replace DB insert
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, SECRET_KEY, {expiresIn: '1h'})

    return res.status(201).json({
        message: `Registering User... (${username}, ${email})`,
        user: username,
        email : email,
        token: token
    })
})

function authToken(req, res, next){
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if(!token){ 
        return res.sendStatus(401)
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if(err){
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    })
}

app.get("/api/me", authToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id) //TODO: replace with DB lookup
    if(!user){
        return res.sendStatus(404)
    }

    return res.status(200).json({
        id: user.id,
        username: user.username,
        email: user.email
    })
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
        const db_res = await pool.query('SELECT * FROM pins');
        console.log("(FETCHPINS) Fetching pins...")
        //console.log(db_res.rows)
        return res.status(200).json({ message: "Pins Fetched", pins: db_res.rows })
    } catch (e) {
        console.log("(FETCHPINS) Could not get pins")
        return res.status(500).json({ message: "Could not fetch pins, internal server error."})
    }
})

// ONLY FOR DEBUGGING - DELETE ME
app.get("/api/userfetch", async (req, res) => {
    try {
        const db_res = await pool.query('SELECT * FROM users');
        console.log("(USERFETCH) Fetching pins...")
        console.log(db_res.rows)
        return res.status(200).json({ message: "Users Fetched", pins: db_res.rows })
    } catch (e) {
        console.log("(USERFETCH) Could not get users")
        return res.status(500).json({ message: "Could not fetch users, internal server error."})
    }
})


app.post("/api/pushpin", async (req, res) => {
    const { category } = req.body
    const { longitude } = req.body
    const { latitude } = req.body

    // USER ID, 
    // const { author_id } = req.body
    // const u_id = author_id

    const u_id = 1

    try {
        const query = {
            text: 'INSERT INTO pins (uid, is_public, type, longitude, latitude, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
            values: [u_id, false, category, parseFloat(longitude), parseFloat(latitude), new Date().toISOString()]
        }

        const db_res = await pool.query(query);
        console.log(`(PUSHPIN) Uploading pin...`)
        return res.status(201).json({ message: "Pin Uploaded" })
    } catch (e) {
        console.log("(PUSHPIN) Could not get pins") 
        return res.status(500).json({ message: "Could not upload, internal server error.", error: e})
    }
})

app.post("/api/deletepin", async (req, res) => {
    const { pin_id } = req.body

    try {
        const db_res = await pool.query("DELETE FROM pins WHERE pid = $1", [parseInt(pin_id)]);
        console.log(`(DELETEPIN) Deleting pin (pid: ${pin_id})...`)
        return res.status(200).json({ message: "Pin Deleted" })
    } catch (e) {
        console.log("(DELETEPIN) Could not get pins")
        return res.status(500).json({ message: "Could not delete pin, internal server error.", error: e})
    }
})
