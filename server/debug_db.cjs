
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected!');
    
    console.log('Searching for user...');
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: 'yves.ahipo@gmail.com' }, { username: 'Evy13' }] }
    });
    
    if (user) {
      console.log('User found in Prisma:', user);
    } else {
      console.log('User NOT found in Prisma.');
    }
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
