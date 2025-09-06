import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create a default user
  const user = await prisma.user.upsert({
    where: { email: "demo@throttlemeet.com" },
    update: {},
    create: {
      email: "demo@throttlemeet.com",
      username: "demoUser",
      displayName: "Demo User",
      bio: "This is a seeded demo user",
    },
  });

  // Create a sample event
  const event = await prisma.event.create({
    data: {
      title: "Cars & Coffee Demo",
      description: "A casual meet-up for car enthusiasts.",
      type: "CAR_MEET",
      organizerId: user.id,
      startTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2h later
      city: "Irvine",
      country: "USA",
      capacity: 50,
    },
  });

  // Create a sample route
  const route = await prisma.route.create({
    data: {
      title: "Ortega Highway Scenic Run",
      description: "A favorite mountain route for enthusiasts.",
      category: "MOUNTAIN",
      difficulty: "INTERMEDIATE",
      distanceKm: 35.5,
      estDurationMin: 60,
      authorId: user.id,
      waypoints: {
        create: [
          { order: 1, name: "Start Point", latitude: 33.555, longitude: -117.672 },
          { order: 2, name: "Lookout", latitude: 33.600, longitude: -117.700 },
          { order: 3, name: "End Point", latitude: 33.650, longitude: -117.750 },
        ],
      },
    },
  });

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
