const getHealth = async (_req, res) => {
  res.json({ status: 'healthy' });
};

module.exports = { getHealth };
