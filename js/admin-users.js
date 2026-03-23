// js/admin-users.js

let allUsersCache = [];

async function initUsersPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadUsers();
    initUsersRealtime();
}

async function loadUsers() {
    const tbody = document.getElementById("usersTableBody");
    const { data: users, error, count } = await supabase
        .from("users")
        .select("id, email, phone, first_name, last_name, merchant_id, role, wallet_balance, created_at, is_free_mode, balance_owed, api_key", { count: 'exact' })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Supabase Error:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding:24px;">Failed to load users: ${error.message}</td></tr>`;
        return;
    }

    console.log(`Supabase Count: ${count}, Array Length: ${users?.length || 0}`);
    
    if (count > 0 && (!users || users.length === 0)) {
        console.warn("RLS may be blocking row data while allowing count.");
    }

    if (users) allUsersCache = users;
    renderUsersTable(allUsersCache);
}

function renderUsersTable(users) {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:24px;">No users found.</td></tr>`;
        return;
    }

    users.forEach(u => {
        const roleColor = u.role === 'admin' ? '#ef4444' : u.role === 'agent' ? '#f59e0b' : '#10b981';
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
        const code = u.merchant_id || '—';
        const fmBadge = u.is_free_mode 
            ? `<span style="background:#166534; color:#86efac; font-weight:700; font-size:10px; padding:2px 6px; border-radius:12px; margin-left:6px;">FREE ON</span>`
            : `<span style="background:#374151; color:#9ca3af; font-weight:700; font-size:10px; padding:2px 6px; border-radius:12px; margin-left:6px;">FREE OFF</span>`;
        const owed = (u.balance_owed && u.balance_owed > 0) ? `<div style="font-size:13px; color:#f59e0b; font-weight:bold; margin-top:4px;">Owes: ₵${Number(u.balance_owed).toFixed(2)}</div>` : '';

        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap;">
                    <div style="font-family:monospace; font-size:12px; color:var(--blue); font-weight:700; margin-bottom:4px;">${code}</div>
                    <div style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:8px;">
                        ${fullName} ${fmBadge}
                    </div>
                    <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:8px; margin-bottom:2px;">Username</div>
                    <div style="font-size:13px; color:white; font-weight:500;">${u.email}</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
                        <span style="background:${roleColor}22; color:${roleColor}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:2px 8px; border-radius:12px; border:1px solid ${roleColor}44;">${u.role}</span>
                        ${u.phone ? `<span style="font-size:11px; color:#64748b;">📞 ${u.phone}</span>` : ''}
                    </div>
                </td>
                <td style="white-space:nowrap;">
                    <strong style="font-size:16px;">₵${Number(u.wallet_balance || 0).toFixed(2)}</strong>
                    ${owed}
                </td>
                <td style="white-space:nowrap;">
                    ${u.api_key 
                        ? `<div style="display:flex; flex-direction:column; gap:6px;">
                             <span style="color:#10b981; font-weight:700; font-size:11px;">● ACTIVE</span>
                             <button class="btn-action" onclick="resetUserApiKey('${u.id}', '${escapeQuote(u.email)}')" style="font-size:10px; padding:4px 8px; background:rgba(239,68,68,0.1); color:#ef4444; border-color:rgba(239,68,68,0.2);">Reset Key</button>
                           </div>` 
                        : `<span style="color:#64748b; font-weight:600; font-size:11px; opacity:0.6;">INACTIVE</span>`
                    }
                </td>
                <td style="white-space:nowrap;">
                    <button class="btn-action" onclick="openUserWalletModal('${u.id}', ${u.wallet_balance})" style="margin-right:4px;">± Bank</button>
                    <button class="btn-action" onclick="openUserTransactionsModal('${u.id}', '${escapeQuote(fullName)}')" style="margin-right:4px;">History</button>
                    <button class="btn-action" onclick="promptChangeRole('${u.id}', '${u.role}', '${escapeQuote(u.email)}')">Role</button>
                    <button class="btn-action" onclick="toggleFreeModeAdmin('${u.id}', ${u.is_free_mode}, '${escapeQuote(u.email)}')" style="background:rgba(255,255,255,0.1); margin-left:8px;">FM Toggle</button>
                </td>
            </tr>
        `;
    });
}

function filterUsersTable() {
    const q = (document.getElementById("userSearchInput")?.value || "").toLowerCase().trim();
    if (!q) return renderUsersTable(allUsersCache);
    const filtered = allUsersCache.filter(u =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q) ||
        (u.merchant_id || "").toLowerCase().includes(q)
    );
    renderUsersTable(filtered);
}

let usersRealtimeChannel = null;
function initUsersRealtime() {
    if (usersRealtimeChannel) return;
    usersRealtimeChannel = supabase
        .channel('admin-users-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            loadUsers();
        })
        .subscribe();
}

window.promptChangeRole = async function(userId, currentRole, email) {
    const newRole = prompt(`Change role for ${email}:\nCurrent: ${currentRole}`, currentRole);
    if (!newRole || newRole === currentRole) return;

    try {
        const { error } = await supabase.rpc("admin_update_role", {
            target_user_id: userId,
            new_role: newRole
        });

        if (error) throw error;
        if(window.showSuccessPopup) window.showSuccessPopup("Role Updated", `User role is now ${newRole}`);
        else alert(`User role is now ${newRole}`);
        loadUsers();
    } catch (err) {
        if(window.showErrorPopup) window.showErrorPopup("Operation Failed", err.message);
        else alert(err.message);
    }
}

window.toggleFreeModeAdmin = async function(userId, currentState, email) {
    const isCurrentlyFree = String(currentState) === 'true';
    const confirmation = confirm(`Are you sure you want to turn Free Mode ${isCurrentlyFree ? 'OFF' : 'ON'} for user ${email}?`);
    if (!confirmation) return;

    try {
        const { data, error } = await supabase.rpc('free_mode_account_action', {
            p_user_id: userId,
            p_action: 'toggle',
            p_order_total: null
        });

        if (error) throw error;
        if (window.showSuccessPopup) window.showSuccessPopup("Free Mode Updated", data.message || "Status changed successfully");
        else alert(data.message || "Status changed successfully");
        
        loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Operation Failed", err.message);
        else alert("Operation Failed: " + err.message);
    }
}

window.resetUserApiKey = async function(userId, email) {
    const confirmation = confirm(`Are you sure you want to RESET the API Key for ${email}?\n\nThis will break their existing integrations!`);
    if (!confirmation) return;

    try {
        if (window.showLoader) window.showLoader();
        
        // Generate a new key (prefix with sk_live_ for clarity)
        const newKey = 'sk_live_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
        
        const { error } = await supabase
            .from('users')
            .update({ api_key: newKey })
            .eq('id', userId);

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Key Reset Success", `A new API key has been generated for ${email}.`);
        else alert("API Key reset successfully.");
        
        loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Reset Failed", err.message);
        else alert("Reset Failed: " + err.message);
    } finally {
        if (window.hideLoader) window.hideLoader();
    }
}

// Global exposure
window.filterUsersTable = filterUsersTable;

document.addEventListener("DOMContentLoaded", initUsersPage);
