const request = require('supertest')
const API_URL = 'http://localhost:8000'

let testID = null
let token = null
let username = null
let email = null


describe('Backend api tests', () => {
    //RUNNING API
    test('GET / should confirm API is running', async () => {
    const res = await request(API_URL).get('/')
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toMatch(/PinPoint API server is running/i)
  })

  //SIGNUP
  test('POST /api/signup with missing fields returns 400', async () => {
    const res = await request(API_URL).post('/api/signup').send({ username: 'testuser' })
    expect(res.statusCode).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  //LOGIN
  test('POST /api/login with bad credentials returns 401', async () => {
    const res = await request(API_URL).post('/api/login').send({ username: 'fake', password: 'wrong' })
    expect(res.statusCode).toBe(401)
    expect(res.body).toHaveProperty('error')
  })
  


  describe('Pin and validation tests', () => {
    beforeAll(async () => {
      email = `testuser_${Date.now()}@ucsc.edu`
      username = `testuser_${Date.now()}`

      const signupRes = await request(API_URL).post('/api/signup').send({
        email,
        username,
        password: 'Pass123!',
      })

      expect(signupRes.statusCode).toBe(201)
      testID = signupRes.body.uid

      await request(API_URL).post('/api/validates/addUser').send({ user: testID })

      const loginRes = await request(API_URL).post('/api/login').send({
        username,
        password: 'Pass123!',
        expotoken: 'ExponentPushToken[placeholder]',
      })

      expect(loginRes.statusCode).toBe(200)
      token = loginRes.body.token
    })

    //PUSH PIN
    test('POST /api/pushpin creates a pin', async () => {
      const res = await request(API_URL).post('/api/pushpin').send({
        category: 'Police',
        longitude: -122.03,
        latitude: 36.97,
        author_id: testID,
      })
      expect(res.statusCode).toBe(201);
    })

    //FETCH PINS
    test('GET /api/fetchpins returns pins', async () => {
      const res = await request(API_URL).get('/api/fetchpins')
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(res.body.pins)).toBe(true)
    })

    //PUSH WATCHER
    test('POST /api/pushwatcher adds a watcher', async () => {
      const res = await request(API_URL).post('/api/pushwatcher').send({
        category: 'Home',
        longitude: -122.02,
        latitude: 36.96,
        radius: 150,
        author_id: testID
      })
      expect(res.statusCode).toBe(201)
    })

    //FETCH WATCHERS
    test('POST /api/fetchwatchers returns watchers', async () => {
      const res = await request(API_URL).post('/api/fetchwatchers').send({ uid: testID })
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(res.body.pins)).toBe(true)
    })

    //ENDORSE PIN
    test('POST /api/validates/add endorses a pin', async () => {
      const pinsRes = await request(API_URL).get('/api/fetchpins')
      const pin = pinsRes.body.pins.find(p => p.uid === testID)
      expect(pin).toBeDefined()

      const res = await request(API_URL).post('/api/validates/add').send({
        user: testID,
        pin: pin.pid
      })

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/Endorsed pin/i);
    })

    //UNENDORSE PIN
    test('POST /api/validates/delete unendorses a pin', async () => {
      const pinsRes = await request(API_URL).get('/api/fetchpins')
      const pin = pinsRes.body.pins.find(p => p.uid === testID)
      expect(pin).toBeDefined()

      const res = await request(API_URL).post('/api/validates/delete').send({
        user: testID,
        pin: pin.pid
      })

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/Unendorsed Pin/i);
    })

    //RETURN ENDORSED PINS
    test('POST /api/validates/getvalidated should return endorsed pins', async () => {
        const pinsRes = await request(API_URL).get('/api/fetchpins')
        const pin = pinsRes.body.pins.find(p => p.uid === testID)
        expect(pin).toBeDefined()

        await request(API_URL).post('/api/validates/add').send({
            user: testID,
            pin: pin.pid
        })
        const res = await request(API_URL).post('/api/validates/getvalidated').send({ user: testID })
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body.validated)).toBe(true)
        expect(res.body.validated).toContain(pin.pid)
    })

    //RETURN ENDORSE COUNT
    test('POST /api/validates/getscore should return endorsement count', async () => {
        const pinsRes = await request(API_URL).get('/api/fetchpins')
        const pin = pinsRes.body.pins.find(p => p.uid === testID)
        expect(pin).toBeDefined()

        const res = await request(API_URL).post('/api/validates/getscore').send({ pin: pin.pid })
        expect(res.statusCode).toBe(200)
        expect(typeof res.body.score).toBe('number')
    })

    //RETURN EVERY USER'S ENDORSED PINS
    test('POST /api/validates/peek should return all rows in validity', async () => {
        const res = await request(API_URL).post('/api/validates/peek')
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body.rows)).toBe(true)
    })

    //DELETE WATCHER
    test('POST /api/deletewatcher removes a watcher', async () => {
      const fetch = await request(API_URL).post('/api/fetchwatchers').send({ uid: testID })
      const lastPin = fetch.body.pins.pop()

      const res = await request(API_URL).post('/api/deletewatcher').send({ pid: lastPin.pid })
      expect(res.statusCode).toBe(200)
    })

    //DELETE PIN
    test('POST /api/deletepin should delete a pin', async () => {
      const pinsRes = await request(API_URL).get('/api/fetchpins')
      const pin = pinsRes.body.pins.find(p => p.uid === testID)
      expect(pin).toBeDefined()

      const res = await request(API_URL).post('/api/deletepin').send({ pid: pin.pid, uid: testID })
      expect(res.statusCode).toBe(200)
    })
  })
})