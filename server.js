const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 8080

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

    return res.status(201).json({
        message: `Authenticated User! (${username})`,
        user: username,
        token: "randomtoken"
    })
})

app.post("/api/signup", (req, res) => {
    const { email } = req.body
    const { username } = req.body
    const { password } = req.body

    return res.status(200).json({
        message: `Registering User... (${username}, ${email})`,
        user: username,
        email : email,
        token: "randomtoken"
    })
})

app.post("/api/access", (req, res) => {
    const { token } = req.body

    return res.status(200).json({
        message: "Token validated, access granted."

    })
})