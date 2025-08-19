const mysql = require('mysql2');

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  port: process.env.MYSQL_PORT,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10, // number of connections in the pool
  queueLimit: 0        // unlimited queueing
});

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1);
  }
  console.log("🐱‍👤 Connected to MySQL Database!");
  connection.release(); // release back to pool
});

// Export promise-based pool
module.exports = pool.promise();
