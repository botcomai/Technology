// js/admin-afa.js

async function initAfaPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadAfaRegistrations();
    initAfaRealtime();
}

async function loadAfaRegistrations() {
    const tbody = document.getElementById('afaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading applications...</td></tr>';

    const { data: afa, error } = await supabase
        .from('afa_registrations')
        .select('*, users(email, phone, first_name, last_name)')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!afa || afa.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No registrations pending.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    afa.forEach(a => {
        const d = new Date(a.created_at).toLocaleDateString();
        const s = (a.status || 'pending').toLowerCase();
        let sClass = 'status-pending';
        if (s === 'approved') sClass = 'status-success';
        if (s === 'rejected') sClass = 'status-failed';
        
        const u = a.users || {};
        const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown';

        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap;">
                    <div style="font-size:12px; color:var(--text-muted);">${d}</div>
                    <div style="font-weight:600; color:white;">${a.full_name}</div>
                </td>
                <td>
                    <div style="font-size:13px; color:white;">${a.phone}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${a.id_type}: ${a.id_number}</div>
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${userName}</td>
                <td><span class="status-badge ${sClass}">${a.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn-action" onclick="openAfaReviewModal('${a.id}')">Review</button>
                </td>
            </tr>
        `;
    });
}

window.openAfaReviewModal = async function(id) {
    const { data: a, error } = await supabase.from('afa_registrations').select('*').eq('id', id).single();
    if(error || !a) return alert("Failed to load application details.");

    document.getElementById('afmId').value = a.id;
    document.getElementById('afmName').innerText = a.full_name;
    document.getElementById('afmPhone').innerText = a.phone;
    document.getElementById('afmDob').innerText = a.dob;
    document.getElementById('afmIdType').innerText = a.id_type;
    document.getElementById('afmIdNumber').innerText = a.id_number;

    // Documents
    const frontContainer = document.getElementById('afmFrontContainer');
    const backContainer = document.getElementById('afmBackContainer');
    frontContainer.innerHTML = a.id_front_url ? `<img src="${a.id_front_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Front ID</span>';
    backContainer.innerHTML = a.id_back_url ? `<img src="${a.id_back_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Back ID</span>';

    document.getElementById('afaReviewModal').style.display = 'flex';
}

window.closeAfaReviewModal = function() {
    document.getElementById('afaReviewModal').style.display = 'none';
}

window.updateAfaStatus = async function(id, status) {
    if(!confirm(`Are you sure you want to ${status} this application?`)) return;

    const { error } = await supabase.from('afa_registrations').update({ status }).eq('id', id);
    if(error) alert(error.message);
    else {
        closeAfaReviewModal();
        loadAfaRegistrations();
    }
}

// Realtime
let afaRealtimeChannel = null;
function initAfaRealtime() {
    if (afaRealtimeChannel) return;
    afaRealtimeChannel = supabase
        .channel('admin-afa-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'afa_registrations' }, () => {
            loadAfaRegistrations();
        })
        .subscribe();
}

document.addEventListener("DOMContentLoaded", initAfaPage);
