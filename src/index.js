const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const app = express();

const PORT = process.env.PORT || 4200;

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

MongoClient.connect(process.env.MONGO_DB_URL, (err, database) => {
  if (err) {
    console.log(err);
    return;
  }

  require('./routes')(app, database);
  app.listen(PORT, () => console.log(`App started on port ${PORT}`));
});
