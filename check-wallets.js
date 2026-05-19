const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/p2p-lending').then(async () => {
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log('Users and their wallets:');
  users.forEach(u => console.log(u.email, u.walletAddress));
  
  const loans = await mongoose.connection.db.collection('loan_requests').find({}).toArray();
  console.log('\nLoan Requests:');
  loans.forEach(l => console.log('borrower:', l.borrowerId, 'amount:', l.loanAmount));
  
  process.exit();
});
