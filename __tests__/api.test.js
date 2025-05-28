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

        //ENDORSE PIN
        test('POST /api/endorsepin should endorse a pin', async () => {
            const fetchRes = await request(API_URL).get(`/api/fetchpins`)
            expect(fetchRes.statusCode).toBe(200)
            expect(fetchRes.body).toHaveProperty('pins')
            expect(Array.isArray(fetchRes.body.pins)).toBe(true)

            const pin = fetchRes.body.pins.find(p => p.uid === testID)
            expect(pin).toBeDefined()
            expect(pin).toHaveProperty('pid')

            const endorseRes = await request(API_URL).post('/api/validates/addUser').send({ user: testID })
            expect([200, 201]).toContain(endorseRes.statusCode)

            const endorsePinRes = await request(API_URL).post('/api/validates/add').send({
                user: testID,
                pin: pin.pid,
            })
            expect(endorsePinRes.statusCode).toBe(201)
            expect(endorsePinRes.body.message).toMatch(/endorsed/i);
        })

        //DELETE PIN
        test('DELETE /api/deletepin/ pid should delete a pin', async () => {
            const pinListRes = await request(API_URL).get('/api/fetchpins');
            expect(pinListRes.statusCode).toBe(200)
            expect(Array.isArray(pinListRes.body.pins)).toBe(true)

            const pin = pinListRes.body.pins.find(p => p.uid === testID)
            expect(pin).toBeDefined()
            expect(pin).toHaveProperty('pid')

            const delRes = await request(API_URL).post('/api/deletepin').send({ pid: pin.pid, uid: testID });
            expect(delRes.statusCode).toBe(200)
            expect(delRes.body.message).toMatch(/deleted/i)
        });

        //TRY DELETE PIN WITH WRONG UID
        test('POST /api/deletepin with wrong UID should fail', async () => {
            const pushRes = await request(API_URL).post('/api/pushpin').send({
                category: 'TempPin',
                longitude: -122.05,
                latitude: 36.96,
                author_id: testID,
            });
            expect(pushRes.statusCode).toBe(201)

            const fetchRes = await request(API_URL).get('/api/fetchpins')
            const pin = fetchRes.body.pins.find(p => p.uid === testID && p.category === 'TempPin')
            expect(pin).toBeDefined()

            const res = await request(API_URL).post('/api/deletepin').send({
                pid: pin.pid,
                uid: 'wrong-id',
            })
            expect(res.statusCode).toBe(403)
        })

        //PUSH WATCHER
        test('POST /api/pushwatcher should upload a watcher', async () => {
            const res = await request(API_URL).post('/api/pushwatcher').send({
                category: 'Accident',
                longitude: -122.05,
                latitude: 36.96,
                author_id: testID,
                radius: 200
            })
            expect(res.statusCode).toBe(201)
            expect(res.body.message).toMatch(/Watch Zone Uploaded/i)
        });

        //FETCH WATCHER
        test('POST /api/fetchwatchers should return user watch zones', async () => {
            const res = await request(API_URL).post('/api/fetchwatchers').send({
                uid: testID
            })
            expect(res.statusCode).toBe(200)
            expect(res.body).toHaveProperty('pins')
            expect(Array.isArray(res.body.pins)).toBe(true)
        });

        //DELTE WATCHER
        test('POST /api/deletewatcher should delete a watcher', async () => {
            const fetchRes = await request(API_URL).post('/api/fetchwatchers').send({ 
                uid: testID 
            });
            expect(fetchRes.statusCode).toBe(200)
            const pins = fetchRes.body.pins
            expect(pins.length).toBeGreaterThan(0)

    
            const pinToDelete = pins[pins.length - 1]
            const delRes = await request(API_URL).post('/api/deletewatcher').send({ pid: pinToDelete.pid })
            expect(delRes.statusCode).toBe(200)
            expect(delRes.body.message).toMatch(/Deleted/i)
        });

        //VALIDATE ADD USER
        test('POST /api/validates/addUser should create a validity entry for user', async () => {
            const res = await request(API_URL).post('/api/validates/addUser').send({ 
                user: testID 
            })
            expect([201, 500]).toContain(res.statusCode)

            if (res.statusCode === 201) {
                expect(res.body.message).toMatch(/Endorsed pin/i)
            }
        })

        //VALIDATE ADD
        test('POST /api/validates/add should endorse a pin', async () => {
            await request(API_URL).post('/api/validates/addUser').send({ 
                user: testID 
            })
            const pushPinRes = await request(API_URL).post('/api/pushpin').send({
                category: 'Test Endorse',
                longitude: -122.0,
                latitude: 36.97,
                author_id: testID
            })
            expect(pushPinRes.statusCode).toBe(201)

            const fetchRes = await request(API_URL).get('/api/fetchpins')
            expect(fetchRes.statusCode).toBe(200)
            const pin = fetchRes.body.pins.find(p => p.uid === testID && p.category === 'Test Endorse')
            expect(pin).toBeDefined()
            expect(pin).toHaveProperty('pid')

            const endorseRes = await request(API_URL).post('/api/validates/add').send({
                user: testID,
                pin: pin.pid,
            })
            expect(endorseRes.statusCode).toBe(201)
            expect(endorseRes.body.message).toMatch(/Endorsed pin/i)
        })

        //VALIDATE DELETE
        test('POST /api/validates/delete should remove endorsement', async () => {
            const fetchRes = await request(API_URL).get(`/api/fetchpins`)
            const pin = fetchRes.body.pins.find(p => p.uid === testID)
            expect(pin).toBeDefined()

            const unendorseRes = await request(API_URL).post('/api/validates/delete').send({
                user: testID,
                pin: pin.pid
            })
            expect(unendorseRes.statusCode).toBe(201)
            expect(unendorseRes.body.message).toMatch(/Unedorsed pin/i)
        })

        //VALIDATE ID
        test('GET /api/validates/:id should return users who endorsed the pin', async () => {
            const fetchRes = await request(API_URL).get(`/api/fetchpins`)
            const pin = fetchRes.body.pins.find(p => p.uid === testID)
            expect(pin).toBeDefined()

            const res = await request(API_URL).get(`/api/validates/${pin.pid}`)
            expect(res.statusCode).toBe(200)
            expect(Array.isArray(res.body)).toBe(true)
        });
    })
})



    
