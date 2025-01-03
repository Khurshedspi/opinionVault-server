const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://opinion-vault-a11.netlify.app"],
    credentials: true,
  })
);

app.use(cookieParser());

const port = process.env.PORT || 5000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fmklx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verifyToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log(token);
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      // console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
  });

  next();
};

async function run() {
  try {
    const servicesCollection = client.db("services").collection("service");
    const reviewCollection = client.db("services").collection("review");

    // generate jwt
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      // create token
      const token = jwt.sign(email, process.env.JWT_SECRET, {
        expiresIn: "365d",
      });
      // console.log(token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout || clear cookie from browser
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.get("/services", async (req, res) => {
      try {
        const { email, search, titleSearch } = req.query;
        const query = {};

        if (email) {
          query.email = email;
        }

        if (search) {
          query.category = { $regex: search, $options: "i" };
        }

        if (titleSearch) {
          query.title = { $regex: titleSearch, $options: "i" };
        }

        const result = await servicesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        // console.error("Error fetching services:", error);
        res.status(500).send({ error: "Failed to fetch services" });
      }
    });

    app.get("/services", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/userReviewData", async (req, res) => {
      const result = await servicesCollection.find().limit(6).toArray();
      res.send(result);
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.post("/services", async (req, res) => {
      const services = req.body;
      const result = await servicesCollection.insertOne(services);
      res.send(result);
    });

    app.delete("/services/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/services/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateData,
      };

      const result = await servicesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // user review part here

    app.get("/userReview", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.get("/userReview/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { reviewId: id };
      const result = await reviewCollection.find(filter).toArray();
      res.send(result);
    });

    app.get("/userReviews/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req?.user?.email;
      if (email != decodedEmail)
        return res.status(401).send({ message: "unauthorized access" });
      const query = { email: email };
      try {
        const result = await reviewCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch user reviews" });
      }
    });

    app.post("/userReview", verifyToken, async (req, res) => {
      const services = req.body;
      const result = await reviewCollection.insertOne(services);

      const query = { _id: new ObjectId(services.reviewId) };
      const service = await servicesCollection.findOne(query);
      let updateDoc = {};

      if (service.reviewCount) {
        updateDoc = {
          $inc: { reviewCount: 1 },
        };
      } else {
        updateDoc = {
          $set: { reviewCount: 1 },
        };
      }
      const options = { upsert: true };
      const updateRes = await servicesCollection.updateOne(
        query,
        updateDoc,
        options
      );
      if (updateRes.modifiedCount > 0) {
        res.send(result);
      }
    });

    app.put("/userReview/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateData,
      };

      try {
        const result = await reviewCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ success: false, error: "Failed to update review" });
      }
    });

    app.delete("/userReview/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("This Movie server is Running Now");
});

app.listen(port, () => {
  console.log(port, "is running");
});
