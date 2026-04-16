require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const run = async () => {
    let { data, error } = await supabase.from('Invoice').select('*, owner:User!Invoice_smeId_fkey(id, email, name, companyName)');
    if(error){ console.log("Attempt 1 Error:", error.message); } else { console.log("Success with Invoice_smeId_fkey"); return; }
    
    let { data:d2, error:e2 } = await supabase.from('Invoice').select('*, owner:User!smeId(id, email, name, companyName)');
    if(e2){ console.log("Attempt 2 Error:", e2.message); } else { console.log("Success with !smeId"); return; }
}
run();
