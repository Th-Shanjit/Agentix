-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('ANY', 'REMOTE_ONLY', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "CtcSource" AS ENUM ('API', 'INFERRED', 'MANUAL');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AlertDigestFrequency" AS ENUM ('DAILY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "resumeText" TEXT,
    "bragSheet" TEXT,
    "yearsExperience" INTEGER,
    "preferredCountries" JSONB,
    "preferredRoles" JSONB,
    "searchRemotePreference" "RemotePreference" DEFAULT 'ANY',
    "alertEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertDigestFrequency" "AlertDigestFrequency" NOT NULL DEFAULT 'DAILY',
    "lastAlertDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "archetype" TEXT,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "ctc" TEXT,
    "ctcSource" "CtcSource" NOT NULL DEFAULT 'MANUAL',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT DEFAULT 'USD',
    "source" TEXT NOT NULL,
    "sourceName" TEXT,
    "externalId" TEXT,
    "description" TEXT,
    "employmentType" TEXT,
    "remotePolicy" TEXT,
    "countryCodes" JSONB,
    "experienceYearsMin" INTEGER,
    "experienceYearsMax" INTEGER,
    "careersUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ingestionStatus" "IngestionStatus" NOT NULL DEFAULT 'VALIDATED',
    "rejectionReason" TEXT,
    "rawPayload" JSONB,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "saved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatchCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "fitScore" DOUBLE PRECISION NOT NULL,
    "upsideScore" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEnrichment" (
    "id" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "ctcBands" JSONB,
    "ratingsWeb" JSONB,
    "forumSentiment" JSONB,
    "resumeAnalysis" JSONB,
    "fiveToneResumes" JSONB,
    "interviewStories" JSONB,
    "negotiationStrategy" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "trackerId" TEXT,
    "matchedRole" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_sourceUrl_key" ON "JobListing"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_dedupeKey_key" ON "JobListing"("dedupeKey");

-- CreateIndex
CREATE INDEX "JobListing_postedAt_idx" ON "JobListing"("postedAt");

-- CreateIndex
CREATE INDEX "JobListing_company_idx" ON "JobListing"("company");

-- CreateIndex
CREATE INDEX "JobListing_title_idx" ON "JobListing"("title");

-- CreateIndex
CREATE INDEX "UserJob_userId_idx" ON "UserJob"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserJob_userId_jobListingId_key" ON "UserJob"("userId", "jobListingId");

-- CreateIndex
CREATE INDEX "JobMatchCache_userId_idx" ON "JobMatchCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchCache_userId_jobListingId_key" ON "JobMatchCache"("userId", "jobListingId");

-- CreateIndex
CREATE UNIQUE INDEX "JobEnrichment_jobListingId_key" ON "JobEnrichment"("jobListingId");

-- CreateIndex
CREATE INDEX "Tracker_userId_idx" ON "Tracker"("userId");

-- CreateIndex
CREATE INDEX "Tracker_company_idx" ON "Tracker"("company");

-- CreateIndex
CREATE INDEX "AlertEvent_userId_sentAt_idx" ON "AlertEvent"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_userId_jobListingId_key" ON "AlertEvent"("userId", "jobListingId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJob" ADD CONSTRAINT "UserJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJob" ADD CONSTRAINT "UserJob_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchCache" ADD CONSTRAINT "JobMatchCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchCache" ADD CONSTRAINT "JobMatchCache_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEnrichment" ADD CONSTRAINT "JobEnrichment_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

