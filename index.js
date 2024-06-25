const express = require('express');
const app = express();

require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174","https://worktrack-employee-management.netlify.app"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oj7uysy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();

    const usersCollection = client.db('worktrack').collection('users');
    const messagesCollection = client.db('worktrack').collection('messages');
    const paymentsCollection = client.db('worktrack').collection('payments');
    const workRecordsCollection = client.db('worktrack').collection('workRecords');

    // Verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const user = req.body;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result.role !== 'admin') return res.status(401).send({ message: 'forbidden access' });
      next();
    };

    // Create payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;

      if (!price || parseFloat(price) < 1) {
        return res.status(400).send({ error: 'Invalid price' });
      }

      const priceInCent = parseFloat(price) * 100;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: priceInCent,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: 'Failed to create payment intent' });
      }
    });


    // save payment history
    app.post('/payments',async(req,res)=>{
      const paymentData = req.body
      // save paymentInfo into database
      const result = await paymentsCollection.insertOne(paymentData)

      // change room availability

      const employeeId = paymentData?.employeeId
      const query = {_id:new ObjectId(employeeId)}
      const updateDoc ={
        $set:{paid :true},
      }
      const updatedPayment = await usersCollection.updateOne(query,updateDoc)
      console.log(updatedPayment);
      console.log(updatedPayment);
      res.send({result,updatedPayment})

    })

    // Get all users
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Get user by email
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // Add new user
    app.post('/users', async (req, res) => {
      const userData = req.body;
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // Get all messages
    app.get('/contact', async (req, res) => {
      const result = await messagesCollection.find().toArray();
      res.send(result);
    });

    // Get all work records
    app.get('/work', async (req, res) => {
      const result = await workRecordsCollection.find().toArray();
      res.send(result);
    });

    // Get work records by email
    app.get('/works/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await workRecordsCollection.find(query).toArray();
      res.send(result);
    });
  // Get payments records by email
  app.get('/payment/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email: email };
    const result = await paymentsCollection.find(query).toArray();
    res.send(result);
  });

// get employee data specifik id
 app.get('/employee/:slug', async (req, res) => {
  const { slug } = req.params;
  let query;

  // Determine the type of slug (email, uid, or ObjectId)
  if (ObjectId.isValid(slug)) {
    query = { _id: new ObjectId(slug) };
  } else if (slug.includes('@')) {
    query = { email: slug };
  } else {
    query = { uid: slug };
  }

  try {
    const result = await usersCollection.findOne(query);
    if (!result) {
      return res.status(404).send({ message: 'Employee not found' });
    }

    res.send(result);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).send({ error: 'Failed to fetch employee' });
  }
});
    // Add new work record
    app.post('/work-post', async (req, res) => {
      const workData = req.body;
      const result = await workRecordsCollection.insertOne(workData);
      res.send(result);
    });

    // Update user role
    app.patch('/users/update/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = { $set: { ...user } };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    
    app.delete('/users/fire/:id', async (req, res) => {
      const id = req.params.id;
    
      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
          }
        };
    
        const result = await usersCollection.updateOne(query, updateDoc);
    
        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: 'User not found or already deactivated' });
        }
    
        const updatedUser = await usersCollection.findOne(query); // Get the updated user data
        res.json({ message: 'User has been fired successfully', user: updatedUser });
      } catch (error) {
        console.error('Error firing user:', error);
        res.status(500).json({ error: 'Failed to fire user' });
      }
    });
    // Update user verification status
    app.patch('/users-update/:id', async (req, res) => {
      const { id } = req.params;
      console.log(`Received request to toggle verification status for employee with ID: ${id}`);
      
      try {
        // Find employee by ID
        const query = { _id: new ObjectId(id) };
        const employee = await usersCollection.findOne(query);
    
        if (!employee) {
          return res.status(404).json({ message: 'Employee not found' });
        }
    
        // Toggle verification status
        const updatedStatus = { $set: { isVerified: !employee.isVerified } };
        await usersCollection.updateOne(query, updatedStatus);
        // console.log(`Employee with ID: ${id} verification status updated to: ${!employee.isVerified}`);
    
        // Find payment data for the employee
        const employeeId = employee._id.toString();
        const month = "2024-01"; 
    
        const paymentQuery = { employeeId, month };
        const paymentData = await paymentsCollection.findOne(paymentQuery);
    
        if (!paymentData) {
          console.log(`No payment data found for employee with ID: ${id} and month: ${month}`);
        } else {
          console.log(`Found payment data for employee with ID: ${id} and month: ${month}:`, paymentData);
        }
    
        // Respond with updated status and payment data (if found)
        res.json({ updatedStatus, paymentData });
    
      } catch (error) {
        console.error('Error updating employee or fetching payment data:', error);
        res.status(500).json({ error: 'Failed to update employee or fetch payment data' });
      }
    });


    // salary chat data 
   
    

    // Ping MongoDB to confirm successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Optionally close the client
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(port, () => {
  console.log(`Work Track is sitting on port ${port}`);
});
