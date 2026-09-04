const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@techhub.com';
  const username = 'admin';

  const existing =
    (await prisma.user.findUnique({ where: { username } })) ||
    (await prisma.user.findUnique({ where: { email } }));

  if (existing) {
    // Usuário master já existe: não sobrescrever senha nem status em re-execuções do seed.
    console.log('Usuário admin master já existe, nada a fazer:', username);
    return;
  }

  // Senha aleatória e descartada: o usuário master nasce INATIVO e só pode ser
  // ativado (com senha definida) por um ADMIN já existente, dentro da aplicação.
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(randomPassword, 10);

  let company = await prisma.company.findFirst({ where: { name: 'Tech Hub' } });
  if (!company) {
    company = await prisma.company.create({ data: { name: 'Tech Hub' } });
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: 'Administrador',
      lastName: 'Master',
      password: hash,
      status: 'INACTIVE',
    },
  });

  await prisma.userCompanyMembership.create({
    data: { userId: user.id, companyId: company.id, role: 'ADMIN' },
  });

  console.log('Usuário admin master criado como INATIVO:', username);
  console.log('Para usar em uma manutenção emergencial, ative-o e defina uma senha nova pela tela de usuários (como ADMIN).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
