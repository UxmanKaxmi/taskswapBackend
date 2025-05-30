-- CreateTable
CREATE TABLE "_TaskHelpers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskHelpers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TaskHelpers_B_index" ON "_TaskHelpers"("B");

-- AddForeignKey
ALTER TABLE "_TaskHelpers" ADD CONSTRAINT "_TaskHelpers_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskHelpers" ADD CONSTRAINT "_TaskHelpers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
