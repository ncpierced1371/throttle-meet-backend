-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('TRACK_DAY', 'CAR_MEET', 'CRUISE', 'AUTOCROSS', 'DRAG_RACE', 'SOCIAL');

-- CreateEnum
CREATE TYPE "public"."RouteCategory" AS ENUM ('SCENIC', 'PERFORMANCE', 'TRACK_ACCESS', 'MOUNTAIN', 'COASTAL');

-- CreateEnum
CREATE TYPE "public"."Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "public"."MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."SocialVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."GroupRole" AS ENUM ('MEMBER', 'MODERATOR', 'ORGANIZER', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "username" VARCHAR(50),
    "displayName" VARCHAR(120),
    "bio" TEXT,
    "avatarUrl" TEXT,
    "homeCity" TEXT,
    "homeCountry" TEXT,
    "unitsMetric" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "make" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "year" INTEGER,
    "color" VARCHAR(40),
    "trim" VARCHAR(60),
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT,
    "visibility" "public"."SocialVisibility" NOT NULL DEFAULT 'PUBLIC',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "hashtags" TEXT[],
    "eventId" TEXT,
    "routeId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Media" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "public"."MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "caption" VARCHAR(280),
    "postId" TEXT,
    "eventId" TEXT,
    "routeId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "type" "public"."EventType" NOT NULL,
    "organizerId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ(6) NOT NULL,
    "endTime" TIMESTAMPTZ(6),
    "locationName" VARCHAR(200),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "address" VARCHAR(300),
    "city" VARCHAR(100),
    "region" VARCHAR(100),
    "country" VARCHAR(100),
    "capacity" INTEGER,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER,
    "currency" VARCHAR(3),
    "weatherNote" VARCHAR(140),
    "qrCheckinEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "groupId" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "isSweep" BOOLEAN NOT NULL DEFAULT false,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "checkinAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Route" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "category" "public"."RouteCategory" NOT NULL,
    "difficulty" "public"."Difficulty" NOT NULL DEFAULT 'BEGINNER',
    "distanceKm" DECIMAL(10,2),
    "estDurationMin" INTEGER,
    "authorId" TEXT NOT NULL,
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RouteWaypoint" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" VARCHAR(120),
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "note" VARCHAR(200),

    CONSTRAINT "RouteWaypoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Group" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LocationRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speedKph" DECIMAL(6,2),
    "headingDeg" DECIMAL(6,2),
    "accuracyM" DECIMAL(6,2),
    "source" VARCHAR(40),

    CONSTRAINT "LocationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "public"."Vehicle"("userId");

-- CreateIndex
CREATE INDEX "SocialPost_authorId_idx" ON "public"."SocialPost"("authorId");

-- CreateIndex
CREATE INDEX "SocialPost_eventId_idx" ON "public"."SocialPost"("eventId");

-- CreateIndex
CREATE INDEX "SocialPost_routeId_idx" ON "public"."SocialPost"("routeId");

-- CreateIndex
CREATE INDEX "Media_ownerId_idx" ON "public"."Media"("ownerId");

-- CreateIndex
CREATE INDEX "Media_postId_idx" ON "public"."Media"("postId");

-- CreateIndex
CREATE INDEX "Media_eventId_idx" ON "public"."Media"("eventId");

-- CreateIndex
CREATE INDEX "Media_routeId_idx" ON "public"."Media"("routeId");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "public"."Event"("organizerId");

-- CreateIndex
CREATE INDEX "Event_type_startTime_idx" ON "public"."Event"("type", "startTime");

-- CreateIndex
CREATE INDEX "EventParticipant_userId_idx" ON "public"."EventParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_userId_key" ON "public"."EventParticipant"("eventId", "userId");

-- CreateIndex
CREATE INDEX "Route_authorId_idx" ON "public"."Route"("authorId");

-- CreateIndex
CREATE INDEX "Route_category_difficulty_idx" ON "public"."Route"("category", "difficulty");

-- CreateIndex
CREATE INDEX "RouteWaypoint_routeId_order_idx" ON "public"."RouteWaypoint"("routeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RouteWaypoint_routeId_order_key" ON "public"."RouteWaypoint"("routeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "public"."Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "public"."Group"("slug");

-- CreateIndex
CREATE INDEX "Group_ownerId_idx" ON "public"."Group"("ownerId");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "public"."GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "public"."GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "LocationRecord_userId_timestamp_idx" ON "public"."LocationRecord"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- AddForeignKey
ALTER TABLE "public"."Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPost" ADD CONSTRAINT "SocialPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPost" ADD CONSTRAINT "SocialPost_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventParticipant" ADD CONSTRAINT "EventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Route" ADD CONSTRAINT "Route_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouteWaypoint" ADD CONSTRAINT "RouteWaypoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationRecord" ADD CONSTRAINT "LocationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
