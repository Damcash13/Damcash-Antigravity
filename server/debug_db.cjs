
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected!');
    
    console.log('Searching for configured admin user...');
    const adminEmail = (process.env.ADMIN_EMAILS || '').split(',')[0]?.trim().toLowerCase();
    if (!adminEmail) {
      console.log('No ADMIN_EMAILS value configured.');
      return;
    }
    const user = await prisma.user.findFirst({
      where: { email: adminEmail }
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
