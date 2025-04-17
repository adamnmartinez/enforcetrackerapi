const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')

const SECRET_KEY = "randomsecretkey" // Generate strong security key and hide in ENV file
const app = express()
app.use(cors())
app.use(express.json())

const PORT = 8080

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

app.post("/api/login", (req, res) => {
    const { username } = req.body
    const { password } = req.body

    const user = users.find(u => u.username === username && u.password === password)
    if (!user){
        return res.status(401).json({ error: "Invalid credentials"})
    }
    
    const token = jwt.sign({ username: user.username, email: user.email }, SECRET_KEY, {expiresIn: '1h'})
    
    return res.status(200).json({
        message: `Authenticated User! (${username})`,
        user: username,
        token: token
    })
})

app.post("/api/signup", (req, res) => {
    const { email } = req.body
    const { username } = req.body
    const { password } = req.body

    if(!email || !username || !password){
        return res.status(400).json({ error: "Missing field" })
    }

    if(users.find(u => u.username === username)){ 
        return res.status(409).json({ error: "Username already exist" })
    }

    users.push({ email: email, username: username, password: password}) // Replace with call to insert into database
    const token = jwt.sign({ username: username, email: email }, SECRET_KEY, {expiresIn: '1h'})

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
    return res.status(200).json({
        message: "Loading user data",
        user: req.user
    })
})