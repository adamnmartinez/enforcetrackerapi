const request = require('supertest')

const API_URL = 'http://localhost:8000'

describe('Backend api tests', () => {
    test('GET / Should respond with API running message', async ()=> {
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


})