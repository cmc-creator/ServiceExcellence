import "dotenv/config";
import app from "./app.js";
const port = process.env.PORT || 4100;

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
