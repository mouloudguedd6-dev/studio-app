async function testLogin() {
  const baseUrl = "http://localhost:3002"
  console.log("Fetching CSRF token...")
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`)
  const csrfData = await csrfRes.json()
  const csrfToken = csrfData.csrfToken
  
  const cookie = csrfRes.headers.get("set-cookie")
  
  console.log("Logging in with CSRF token:", csrfToken)
  
  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookie
    },
    body: new URLSearchParams({
      csrfToken: csrfToken,
      email: "admin@studio.com",
      password: "admin",
      json: "true"
    })
  })
  
  const loginData = await loginRes.json()
  console.log("Login Response:", loginData)
  
  if (loginData.url && !loginData.url.includes("error")) {
    console.log("✅ Login SUCCESS! Redirect URL:", loginData.url)
    
    // Test if we get a session
    const sessionCookie = loginRes.headers.get("set-cookie")
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { "Cookie": sessionCookie }
    })
    const sessionData = await sessionRes.json()
    console.log("✅ Session Data:", JSON.stringify(sessionData))
  } else {
    console.error("❌ Login FAILED. Response:", loginData)
    process.exit(1)
  }
}

testLogin().catch(console.error)
