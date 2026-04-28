const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Database...');
  
  // Create Demo Users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const demoUsers = [
    { username: 'Magnus_Carlsen', email: 'magnus@damcash.com', chessRating: 2882, checkersRating: 1500, chessGames: 120 },
    { username: 'Hikaru_Nakamura', email: 'hikaru@damcash.com', chessRating: 2800, checkersRating: 1600, chessGames: 95 },
    { username: 'Garry_Kasparov', email: 'garry@damcash.com', chessRating: 2851, checkersRating: 1550, chessGames: 200 },
    { username: 'Anna_Cramling', email: 'anna@damcash.com', chessRating: 2200, checkersRating: 1450, chessGames: 50 },
    { username: 'Checkers_King', email: 'checkers@damcash.com', chessRating: 1200, checkersRating: 2400, checkersGames: 500 },
    { username: 'AlphaZero', email: 'ai@damcash.com', chessRating: 3500, checkersRating: 3000, chessGames: 1000, checkersGames: 1000 },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        email: u.email,
        passwordHash,
        chessRating: u.chessRating,
        peakChessRating: u.chessRating,
        chessGames: u.chessGames || 0,
        checkersRating: u.checkersRating,
        peakCheckersRating: u.checkersRating,
        checkersGames: u.checkersGames || 0,
        wallet: { create: { balance: 1000.00 } }
      }
    });
  }

  // Create initial tournaments
  const now = Date.now();
  
  await prisma.tournament.create({
    data: {
      name: 'Weekend Arena',
      universe: 'chess',
      format: 'arena',
      timeControl: '3+0',
      prizePool: 500,
      startsAt: new Date(now + 86400000), // Next 24 hours
    }
  });

  await prisma.tournament.create({
    data: {
      name: 'Grand Checkers Open',
      universe: 'checkers',
      format: 'swiss',
      timeControl: '5+0',
      prizePool: 1000,
      startsAt: new Date(now + 172800000), // Next 48 hours
    }
  });

  console.log('Seeding Complete ✅');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
