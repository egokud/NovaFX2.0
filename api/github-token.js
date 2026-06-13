export default function handler(req, res) {
  if (req.query.owner !== "147491542") {
    return res.status(403).json({error: "forbidden"});
  }
  const token = process.env.GITHUB_PAT;
  if (!token) return res.status(500).json({error: "not configured"});
  res.json({token});
}
