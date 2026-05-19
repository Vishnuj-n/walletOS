const API_BASE = process.env.API_BASE; // Your Backend API
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // Get this from browser localStorage after admin login

if (!API_BASE) {
  console.error("❌ Error: API_BASE environment variable is not set.");
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error("❌ Error: ADMIN_TOKEN environment variable is not set.");
  console.error("   Get a valid JWT token from your browser's localStorage after logging into the admin dashboard,");
  console.error("   then run: set ADMIN_TOKEN=your_token_here && npx ts-node apps/admin/src/app/scripts/seed.tsx");
  process.exit(1);
}

const MOCK_DATA = [
  { tenant: "zomato-tenant", users: ["ZOMATO_USER_101", "ZOMATO_USER_102", "ZOMATO_USER_103"] },
  { tenant: "uber-tenant", users: ["UBER_DRIVER_A1", "UBER_DRIVER_B2"] },
  { tenant: "walletos-system-tenant", users: ["INTERNAL_RESERVE_01", "INTERNAL_RESERVE_02"] }
];

async function seed() {
  console.log("🚀 Starting WalletOS Database Seeding...");

  for (const group of MOCK_DATA) {
    for (const externalId of group.users) {
      try {
        // 1. Create a Wallet
        const walletResponse = await fetch(`${API_BASE}/admin/wallets`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ADMIN_TOKEN}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `seed-wallet-${externalId}`
          },
          body: JSON.stringify({
            external_user_id: externalId,
            tenant_id: group.tenant,
            currency: "INR",
            label: `${externalId} Primary Wallet`
          })
        });

        const wallet = await walletResponse.json();
        
        if (walletResponse.ok) {
          console.log(`✅ Created wallet for: ${externalId}`);

          // 2. Add a random Credit transaction to make the charts look good
          const amount = (Math.random() * 5000 + 100).toFixed(2);
          const txResponse = await fetch(`${API_BASE}/admin/transactions/credit`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ADMIN_TOKEN}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `seed-tx-${externalId}`
            },
            body: JSON.stringify({
              wallet_id: wallet.wallet_id,
              amount: amount,
              description: "Initial Seed Deposit",
              reason: "System Initialization"
            })
          });
          if (txResponse.ok) {
            console.log(`   💰 Credited ₹${amount} to ${externalId}`);
          } else {
            const errorText = await txResponse.text();
            console.error(`   ❌ Failed to credit ₹${amount} to ${externalId}: ${txResponse.status} ${errorText}`);
          }
        } else {
          console.error(`❌ Failed for ${externalId}:`, wallet.error);
        }
      } catch (err) {
        console.error(`💥 Critical error seeding ${externalId}:`, err);
      }
    }
  }

  console.log("\n✨ Seeding Complete! Refresh your Dashboard to see the data.");
}

seed();