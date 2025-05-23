const request = require('supertest')

const API_URL = 'http://localhost:8000'

let testID = null;
let token = null;
let username = null;
let email = null;

describe('Backend api tests', () => {
    //TESTING FOR SIGNUP SIGNIN FUNCTIONS
    test('GET / Should respond with API running message', async () => {
        const res = await request(API_URL).get('/')
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/PinPoint API server is running/i)
    })

    test('POST /api/signup with missing fields return 400', async () => {
        const res = await request(API_URL).post('/api/signup').send({username: 'testuser'})
        expect(res.statusCode).toBe(400)
        expect(res.body).toHaveProperty('error')
    })

    test('POST /api/login with bad creditentials return 401', async () => {
        const res = await request(API_URL).post('/api/login').send({username: 'fake', password: 'wrong'})
        expect(res.statusCode).toBe(401)
        expect(res.body).toHaveProperty('error')
    })
    
    describe('Backend pin function tests', () => {
        //TESTING FOR PIN FUNCTIONS
        beforeAll(async () => {
            email = `testpinuser_${Date.now()}@example.com`
            username =  `testpinuser_${Date.now()}`
            const signupRes = await request(API_URL).post('/api/signup').send({
                email,
                username,
                password: 'pass123'
            })
            expect(signupRes.statusCode).toBe(201)
            token = signupRes.body.token
            
            //LOGIN
            const loginRes = await request(API_URL).post('/api/login').send({
                username,
                password: 'pass123',
                expotoken: 'ExponentPushToken[test-token]'
            })
            expect(loginRes.statusCode).toBe(200)
            
            //ME
            const meRes = await request(API_URL).get('/api/me').set('authorization', token)
            expect(meRes.statusCode).toBe(200)
            testID = meRes.body.id
        })
        
        //PUSH PIN
        test('POST /api/pushpin should upload pin', async () => {
            const res = await request(API_URL).post('/api/pushpin').send({
                category: 'Police',
                longitude: -122.03,
                latitude: 36.97,
                author_id: testID,
            })
            expect(res.statusCode).toBe(201)
            expect(res.body.message).toMatch(/Pin Uploaded/i)
        })
        
        //FETCH PIN
        test('GET /api/fetchpins should return pins', async () => {
            const res = await request(API_URL).get('/api/fetchpins')
            expect(res.statusCode).toBe(200)
            expect(res.body).toHaveProperty('pins')
            expect(Array.isArray(res.body.pins)).toBe(true)
        })
    })
})



    
