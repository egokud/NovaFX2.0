export default function handler(req, res) {
  const secret = req.query.secret || req.headers['x-claude-secret'];
  if (secret !== process.env.CLAUDE_SECRET) {
    return res.status(403).json({error: "forbidden"});
  }
  const token = process.env.GITHUB_PAT;
  if (!token) return res.status(500).json({error: "not configured"});
  res.json({token});
}
