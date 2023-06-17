const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
require("dotenv").config();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f7zs7lw.mongodb.net`;
const stripe = require("stripe")(process.env.DB_STRIPEKEY);
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized acess" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (error, decoded) {
    if (error) {
      return res
        .status(403)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // await client.connect();

    const db = client.db("classesDB");
    const classesCollection = db.collection("classesCollections");

    const usersDB = client.db("usersDB");
    const usersCollections = usersDB.collection("usersCollections");

    const instructorDB = client.db("instructorDB");
    const instructorCollections = instructorDB.collection(
      "instructorCollections"
    );

    const myClassDB = client.db("myClassDB");
    const myClassCollections = myClassDB.collection("myClassCollections");

    const paymentCollections = client
      .db("paymentDB")
      .collection("paymentCollections");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbiden access" });
      }
      next();
    };

    // jwt

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // payment

    app.post("/payments/:id", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollections.insertOne(payment);
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const classes = await classesCollection.findOne(query);
      const updateDoc = {
        $set: {
          seat: classes.seat > 0 ? classes.seat - 1 : 0,
          studentsEnrolment: (classes.studentsEnrolment || 0) + 1, // Increment student enrollment count
        },
      };
      const filter = { classId: id.toString() };
      const updatedClasses = await classesCollection.updateOne(
        query,
        updateDoc
      );
      console.log(filter);
      const myClassResult = await myClassCollections.deleteOne(filter);
      res.send({ result, updatedClasses, myClassResult });
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = { myemail: req.query.email };
      }

      if (req.decoded.email !== req.query.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const result = await paymentCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ student: false });
      }
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const result = { student: user?.role === "student" };
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.get("/myselectedclass/:id", async (req, res) => {
      const id = req.params.id;
      let query = { _id: new ObjectId(id) };
      const result = await myClassCollections.findOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const users = req.body;
      const query = {
        email: users.email,
      };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollections.insertOne(users);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      let filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      let filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await usersCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/:id", async (req, res) => {
      const id = req.params.id;
      let filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/deny/:id", async (req, res) => {
      const id = req.params.id;
      let filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "denied",
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/feedback/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const { feedback } = req.body; // Destructure the feedback property

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback, // Use the extracted feedback value
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/myselectedclass", async (req, res) => {
      const myClass = req.body;
      const result = await myClassCollections.insertOne(myClass);
      res.send(result);
    });

    app.get("/myselectedclass", verifyJWT, async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = { myemail: req.query.email };
      }

      if (req.decoded.email !== req.query.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const result = await myClassCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get("/classes/instructor", verifyJWT, async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }
      if (req.decoded.email !== req.query.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/myselectedclass/:id", async (req, res) => {
      const id = req.params.id;
      let query = { _id: new ObjectId(id) };
      const result = await myClassCollections.deleteOne(query);
      res.send(result);
    });

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollections.find().toArray();
      res.send(result);
    });

    app.post("/classes", async (req, res) => {
      const classes = req.body;
      const result = await classesCollection.insertOne(classes);
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const result = await instructorCollections.find().toArray();
      res.send(result);
    });

    console.log("Connected to MongoDB successfully!");
    // await client.db("admin").command({ ping: 1 });
  } 
  
  
  finally {
   // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.error);

app.get("/", (req, res) => {
  res.send("Summer camp");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
