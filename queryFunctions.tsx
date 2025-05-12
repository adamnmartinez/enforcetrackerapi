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
