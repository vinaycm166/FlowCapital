const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const run = async () => {
    let { data, error } = await supabase.from('Invoice').select('*');
    if(error){ console.error(error); return; }
    console.log(JSON.stringify(data, null, 2));
}
run();
