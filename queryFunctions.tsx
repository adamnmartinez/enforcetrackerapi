/*import express, { Router } from 'express';
import {pool} from "./test.js"

const express = require("express");
const app = express();
const taskRouter = Router();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
//taskRouter.get('/tasks', getTasks);
*/

app.post('/tasks/addUser', async(req, res) =>{
  const { user }  = req.body
  try{
    const query = {
      text: "INSERT INTO validity (uid) VALUES ($1)",
      values: [user]
    }
    const db_res = await pool.query(query);
    return res.status(201).json({ message: "Endorsed pin" });
  }catch (e){
    console.log("Unable to complete request")
    console.log(e)
    return res.status(500).json({ message: "internal server error.", error: e})
  }
})

app.post('/tasks/add', async(req, res) =>{
  const { user }  = req.body
  const { pin } = req.body
  try{
    const query = {
      text: "UPDATE validity SET endorsed_pins = endorsed_pins || ARRAY[$1] WHERE uid = $2",
      values: [pin, user]
    }
    const db_res = await pool.query(query);
    return res.status(201).json({ message: "Endorsed pin" });
  }catch (e){
    console.log("Unable to complete request")
    console.log(e)
    return res.status(500).json({ message: "internal server error.", error: e})
  }
})

app.post('/tasks/delete', async(req, res) =>{
  const { user }  = req.body
  const { pin } = req.body

  try{
    console.log("Sending remove pin request");
    const query = {
      text: 'UPDATE validity SET endorsed_pins = array_remove(endorsed_pins, $1) WHERE uid = $2',
      values: [pin, user]
    }
    const db_res = await pool.query(query);
    return res.status(201).json({ message: "Unedorsed pin" });
  }catch (e){
    console.log(e)
    return res.status(500).json({ message: "internal server error.", error: e})
  }
})

app.get('/tasks/validates/:id', async(req, res)=>{
  const pid = req.params['id']
  const query = {
    text: 'SELECT * FROM validity WHERE $1 = ANY(endorsed_pins)',
    values: [pid]
  }
  console.log("Sending request")
  const db_res = await pool.query(query);
  //console.log(db_res);
  console.log(db_res.rows);
  return res.status(200).json(db_res.rows);
})

/*const PORT = 3000
app.listen(PORT, async () => {
    console.log(`Server initalized on port ${PORT}`)
    await pool.connect()
    const res = await pool.query('SELECT $1::text as connected', ['Connection to postgres successful!']);
    console.log(res.rows[0].connected);
})*/
