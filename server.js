const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { v4: uuidv4 } = require('uuid')

const SECRET_KEY = "randomsecretkey" // Generate strong security key and hide in ENV file
const app = express()
app.use(cors())
app.use(express.json())

const PORT = 8000

const users = []; //change with database connection

app.listen(PORT, () => {
    console.log(`Server initalized on port ${PORT}`)
    // TODO: Get Database Connection
})

app.get("/", (req, res) => {
    return res.status(200).json({
        message: "PinPoint API server is running."
    })
})

app.post("/api/login", async (req, res) => {
    const { username } = req.body
    const { password } = req.body

    const user = users.find(u => u.username === username && u.password === password) //TODO: replace with DB query
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