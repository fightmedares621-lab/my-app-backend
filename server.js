// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors'); 
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
// Use the port provided by the environment (like on Railway) or default to 3001 for local development
const PORT = process.env.PORT || 3001; 
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// --- Middleware ---
app.use(cors()); // Allows your frontend to communicate with this backend
app.use(express.json()); // Allows the server to read JSON from request bodies

// --- NEW: Ensure 'uploads' directory exists ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- NEW: Static File Serving for Uploads ---
// This makes the 'uploads' folder public so videos can be played.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- NEW: Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Save files to the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Create a unique filename to prevent overwrites
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

// --- JSONBin.io Configuration (UPDATED FOR DISTRIBUTED USERS) ---
// IMPORTANT: Store your API Key in an environment variable for security
const API_KEY = process.env.JSONBIN_API_KEY;

// --- CRITICAL: Check for Environment Variables on Startup ---
if (!API_KEY) {
    console.error("FATAL ERROR: JSONBIN_API_KEY is not defined. The application cannot start.");
    process.exit(1); // This stops the server from running
}

// The two bins that store all user accounts.
const ALL_USERS_BIN_IDS = [
    '68deea1543b1c97be95856b2', // Original user bin
    '68e395a643b1c97be95c2bc3'  // Second user bin
];

// Other Database Bins
const USER_GROUPS_BIN_ID = '68e18ff743b1c97be95a7ce7';
const APPLICATIONS_BIN_ID = '68e1c512d0ea881f40958e65';
const GAME_SUBMISSIONS_BIN_ID = '68e27efad0ea881f40961dcb';
const PUBLISHED_GAMES_BIN_ID = '68e27f35d0ea881f40961e11';
const DODGE_GAMEPASS_BIN_ID = '68e28e47d0ea881f40962fed';
const AUTHDONATE_GAMEPASS_BIN_ID = '68e1a74043b1c97be95a8bb1';
const FLOORISLAVA_GAMEPASS_BIN_ID = '68f1a2b3d4ea881f40a5c3d4'; // New BIN for Floor is Lava gamepasses
const DONATED_LEADERBOARD_BIN_ID = '68e1a753ae596e708f064328';
const RAISED_LEADERBOARD_BIN_ID = '68e1a76d43b1c97be95a8bcb';
const IMAC_WEBSITES_BIN_ID = '68e41060d0ea881f40979f96'; // New BIN for .imac websites

// --- NEW: Hangman Database Bins ---
const HANGMAN_LOBBIES_BIN_ID = '68e85a8ad0ea881f409bd1de'; // Replace with your actual new bin ID
const HANGMAN_LEADERBOARD_BIN_ID = '68e85aa9ae596e708f0c991f'; // Replace with your actual new bin ID

// --- NEW: Media Database Bins ---
const MEDIA_VIDEOS_BIN_ID = '68f39322d0ea881f40a9f3ca'; // New BIN for videos
const MEDIA_VIEWS_META_BIN_ID = '68f3933cae596e708f1ab899'; // New BIN for tracking view generation


// Helper function to generate URLs
const getBinUrl = (binId) => `https://api.jsonbin.io/v3/b/${binId}`;

// URLs for single-bin data
const GROUPS_URL = getBinUrl(USER_GROUPS_BIN_ID);
const APPLICATIONS_URL = getBinUrl(APPLICATIONS_BIN_ID);
const SUBMISSIONS_URL = getBinUrl(GAME_SUBMISSIONS_BIN_ID);
const PUBLISHED_GAMES_URL = getBinUrl(PUBLISHED_GAMES_BIN_ID);
const DODGE_GAMEPASS_URL = getBinUrl(DODGE_GAMEPASS_BIN_ID);
const AUTHDONATE_GAMEPASS_URL = getBinUrl(AUTHDONATE_GAMEPASS_BIN_ID);
const FLOORISLAVA_GAMEPASS_URL = getBinUrl(FLOORISLAVA_GAMEPASS_BIN_ID); // URL for Floor is Lava gamepasses
const DONATED_LEADERBOARD_URL = getBinUrl(DONATED_LEADERBOARD_BIN_ID);
const RAISED_LEADERBOARD_URL = getBinUrl(RAISED_LEADERBOARD_BIN_ID);
const IMAC_WEBSITES_URL = getBinUrl(IMAC_WEBSITES_BIN_ID); // URL for .imac websites

// --- NEW: Hangman URLs ---
const HANGMAN_LOBBIES_URL = getBinUrl(HANGMAN_LOBBIES_BIN_ID);
const HANGMAN_LEADERBOARD_URL = getBinUrl(HANGMAN_LEADERBOARD_BIN_ID);

// --- NEW: Media URLs ---
const MEDIA_VIDEOS_URL = getBinUrl(MEDIA_VIDEOS_BIN_ID);
const MEDIA_VIEWS_META_URL = getBinUrl(MEDIA_VIEWS_META_BIN_ID);


// --- HELPER FUNCTIONS FOR DISTRIBUTED USER DATABASE ---

/**
 * Fetches user records from all user bins.
 * @returns {Promise<{allUsers: Array, binRecords: Map<string, Object>}>}
 * - allUsers: A single, merged array of all user objects.
 * - binRecords: A Map where key is the binId and value is { users: Array, fetchedData: Object }.
 */
async function fetchAllUserRecords() {
    const fetchPromises = ALL_USERS_BIN_IDS.map(binId => 
        fetch(`${getBinUrl(binId)}/latest`, { headers: { 'X-Master-Key': API_KEY } })
    );

    const responses = await Promise.all(fetchPromises);
    const data = await Promise.all(responses.map(res => {
        if (!res.ok) throw new Error(`Failed to fetch bin: ${res.url}`);
        return res.json();
    }));

    let allUsers = [];
    const binRecords = new Map();

    for (let i = 0; i < ALL_USERS_BIN_IDS.length; i++) {
        const binId = ALL_USERS_BIN_IDS[i];
        // The structure is { record: { users: [...] } }
        const binUsers = (data[i].record && data[i].record.users) ? data[i].record.users : [];
        allUsers.push(...binUsers);
        binRecords.set(binId, { users: binUsers, fetchedData: data[i] }); 
    }
    return { allUsers, binRecords };
}

/**
 * Finds a user and returns their bin ID and record details for targeted updates.
 * @param {{allUsers: Array, binRecords: Map}} allRecords - Result from fetchAllUserRecords.
 * @param {number} userId - The ID of the user to find.
 * @returns {{binId: string, users: Array, userIndex: number, user: Object}|null}
 */
function findUserAndBin(allRecords, userId) {
    for (const [binId, record] of allRecords.binRecords.entries()) {
        const users = record.users;
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            return {
                binId,
                users, // The specific list of users from this bin
                userIndex
            };
        }
    }
    return null;
}

// --- API Endpoint for Creating a Group (UPDATED) ---
app.post('/api/create-group', async (req, res) => {
    const { userId, groupName, groupDescription, groupIconUrl } = req.body;

    if (!userId || !groupName || !groupDescription) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    try {
        // --- Step 1: Fetch user and group data ---
        const [userRecords, groupsRes] = await Promise.all([
            fetchAllUserRecords(),
            fetch(`${GROUPS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } })
        ]);
        
        if (!groupsRes.ok) {
            throw new Error('Failed to fetch group data from database.');
        }

        const allUsers = userRecords.allUsers;
        const groupsData = await groupsRes.json();
        let allGroups = (groupsData.record && groupsData.record.groups) ? groupsData.record.groups : [];

        // --- Step 2: Validate the request and find user's bin ---
        const userBinData = findUserAndBin(userRecords, userId);
        if (!userBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId, users: userBinUsers, userIndex } = userBinData;

        if (userBinUsers[userIndex].authTokens < 5000) {
            return res.status(403).json({ success: false, message: 'Insufficient AuthTokens.' });
        }

        // --- Step 3: Modify the data ---
        // Deduct tokens
        userBinUsers[userIndex].authTokens -= 5000;

        // Create new group
        const newGroupId = allGroups.length > 0 ? Math.max(...allGroups.map(g => g.id)) + 1 : 1;
        const newGroup = {
            id: newGroupId,
            name: groupName,
            description: groupDescription,
            iconUrl: groupIconUrl || '',
            ownerId: userId,
            members: [userId],
            createdAt: new Date().toISOString()
        };
        allGroups.push(newGroup);

        // --- Step 4: Write the updated data back (Targeted PUT for user, normal PUT for groups) ---
        const [updateUsersRes, updateGroupsRes] = await Promise.all([
            fetch(getBinUrl(binId), { // PUT only to the bin the user is in
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify({ users: userBinUsers })
            }),
            fetch(GROUPS_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify({ groups: allGroups })
            })
        ]);

        if (!updateUsersRes.ok || !updateGroupsRes.ok) {
            throw new Error('Failed to save updated data to database.');
        }

        // --- Step 5: Respond with success ---
        res.status(200).json({ success: true, message: 'Group created successfully!', newGroup });

    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- API Endpoint for Searching Users by ID (FIXED TO SEARCH ALL BINS) ---
app.get('/api/users/search/:id', async (req, res) => {
    const searchId = parseInt(req.params.id);

    if (isNaN(searchId)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format.' });
    }

    try {
        // *** FIX: Fetch all user records from all bins ***
        const { allUsers: allAccounts } = await fetchAllUserRecords(); 

        if (allAccounts.length === 0) {
            return res.status(404).json({ success: false, message: 'No users or bots found in database.' });
        }

        // Search for the account by ID
        const foundAccount = allAccounts.find(u => u.id === searchId);

        if (foundAccount) {
            // Return only safe/public information
            const publicUser = {
                id: foundAccount.id,
                username: foundAccount.username,
                bio: foundAccount.bio,
                pfp: foundAccount.pfp,
                friends: foundAccount.friends ? foundAccount.friends.length : 0
            };
            return res.status(200).json({ success: true, user: publicUser });
        } else {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

    } catch (error) {
        console.error('Error searching for user:', error.message);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});


// --- Helper function for Admin Auth (UPDATED) ---
async function isAdmin(userId) {
    if (!userId) return false;
    try {
        const { allUsers } = await fetchAllUserRecords(); // Ensure this fetches all users
        const user = allUsers.find(u => u.id === userId);
        return user && user.username.toLowerCase() === 'madeonice';
    } catch (error) {
        console.error("Admin check failed:", error);
        return false;
    }
}

// --- API Endpoint for Verifying a Group ---
app.post('/api/groups/:id/verify', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single GROUPS_URL)
    const { adminId, isVerified } = req.body;
    const groupId = parseInt(req.params.id);

    if (!(await isAdmin(adminId))) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
    }

    try {
        const groupsRes = await fetch(`${GROUPS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!groupsRes.ok) throw new Error('Failed to fetch groups data.');
        
        const groupsData = await groupsRes.json();
        let allGroups = (groupsData.record && groupsData.record.groups) ? groupsData.record.groups : [];

        const groupIndex = allGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        allGroups[groupIndex].isVerified = isVerified;

        await fetch(GROUPS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ groups: allGroups })
        });

        res.status(200).json({ success: true, message: `Group ${isVerified ? 'verified' : 'unverified'} successfully.` });

    } catch (error) {
        console.error('Error verifying group:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- API Endpoint for Deleting a Group ---
app.delete('/api/groups/:id', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single GROUPS_URL)
    const { adminId } = req.body;
    const groupId = parseInt(req.params.id);

    if (!(await isAdmin(adminId))) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Admin access required.' });
    }

    try {
        const groupsRes = await fetch(`${GROUPS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!groupsRes.ok) throw new Error('Failed to fetch groups data.');

        const groupsData = await groupsRes.json();
        let allGroups = (groupsData.record && groupsData.record.groups) ? groupsData.record.groups : [];

        const updatedGroups = allGroups.filter(g => g.id !== groupId);

        await fetch(GROUPS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ groups: updatedGroups })
        });

        res.status(200).json({ success: true, message: 'Group deleted successfully.' });

    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- API Endpoint for Joining a Group ---
app.post('/api/groups/:id/join', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single GROUPS_URL)
    const { userId } = req.body;
    const groupId = parseInt(req.params.id);

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    try {
        const groupsRes = await fetch(`${GROUPS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!groupsRes.ok) throw new Error('Failed to fetch groups data.');
        
        const groupsData = await groupsRes.json();
        let allGroups = (groupsData.record && groupsData.record.groups) ? groupsData.record.groups : [];

        const groupIndex = allGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        if (allGroups[groupIndex].members.includes(userId)) {
            return res.status(400).json({ success: false, message: 'User is already a member.' });
        }

        allGroups[groupIndex].members.push(userId);

        await fetch(GROUPS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ groups: allGroups })
        });

        res.status(200).json({ success: true, message: 'Successfully joined the group.' });

    } catch (error) {
        console.error('Error joining group:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- API Endpoint for Group Owner to Update Details ---
app.put('/api/groups/:id/update', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single GROUPS_URL)
    const { ownerId, name, description, iconUrl } = req.body;
    const groupId = parseInt(req.params.id);

    if (!ownerId || !name || description === undefined || iconUrl === undefined) {
        return res.status(400).json({ success: false, message: 'Missing required fields for update.' });
    }

    try {
        const groupsRes = await fetch(`${GROUPS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!groupsRes.ok) throw new Error('Failed to fetch groups data.');
        
        const groupsData = await groupsRes.json();
        let allGroups = (groupsData.record && groupsData.record.groups) ? groupsData.record.groups : [];

        const groupIndex = allGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        // Authorization check
        if (allGroups[groupIndex].ownerId !== ownerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: You are not the owner of this group.' });
        }

        // Update the group details
        allGroups[groupIndex].name = name;
        allGroups[groupIndex].description = description;
        allGroups[groupIndex].iconUrl = iconUrl;

        await fetch(GROUPS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ groups: allGroups })
        });

        res.status(200).json({ success: true, message: 'Group details updated successfully.' });

    } catch (error) {
        console.error('Error updating group:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- FRIEND SYSTEM ENDPOINTS (UPDATED TO USE ALL BINS) ---

// Send a friend request
app.post('/api/friends/request', async (req, res) => {
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) return res.status(400).json({ success: false, message: 'Missing IDs.' });

    try {
        const userRecords = await fetchAllUserRecords();
        const allUsers = userRecords.allUsers;

        const sender = allUsers.find(u => u.id === senderId);
        const receiverBinData = findUserAndBin(userRecords, receiverId);
        
        if (!sender || !receiverBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId: receiverBinId, users: receiverBinUsers, userIndex: receiverIndex } = receiverBinData;

        // Initialize arrays if they don't exist
        if (!receiverBinUsers[receiverIndex].friendRequests) receiverBinUsers[receiverIndex].friendRequests = [];
        if (!receiverBinUsers[receiverIndex].friends) receiverBinUsers[receiverIndex].friends = [];

        // Check if already friends or request already sent
        if (receiverBinUsers[receiverIndex].friends.includes(senderId)) return res.status(400).json({ success: false, message: 'You are already friends.' });
        if (receiverBinUsers[receiverIndex].friendRequests.some(req => req.from === senderId)) return res.status(400).json({ success: false, message: 'Request already sent.' });

        receiverBinUsers[receiverIndex].friendRequests.push({ from: sender.id, fromUsername: sender.username });

        // PUT only to the receiver's bin
        await fetch(getBinUrl(receiverBinId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: receiverBinUsers })
        });

        res.status(200).json({ success: true, message: 'Friend request sent.' });

    } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Accept a friend request
app.post('/api/friends/accept', async (req, res) => {
    const { accepterId, requesterId } = req.body;
    if (!accepterId || !requesterId) return res.status(400).json({ success: false, message: 'Missing IDs.' });

    try {
        const userRecords = await fetchAllUserRecords();

        const accepterBinData = findUserAndBin(userRecords, accepterId);
        const requesterBinData = findUserAndBin(userRecords, requesterId);

        if (!accepterBinData || !requesterBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId: accepterBinId, users: accepterBinUsers, userIndex: accepterIndex } = accepterBinData;
        const { binId: requesterBinId, users: requesterBinUsers, userIndex: requesterIndex } = requesterBinData;

        // Remove request from accepter's list
        accepterBinUsers[accepterIndex].friendRequests = (accepterBinUsers[accepterIndex].friendRequests || []).filter(req => req.from !== requesterId);

        // Add each other to friends lists
        if (!accepterBinUsers[accepterIndex].friends) accepterBinUsers[accepterIndex].friends = [];
        if (!requesterBinUsers[requesterIndex].friends) requesterBinUsers[requesterIndex].friends = [];

        if (!accepterBinUsers[accepterIndex].friends.includes(requesterId)) {
            accepterBinUsers[accepterIndex].friends.push(requesterId);
        }
        if (!requesterBinUsers[requesterIndex].friends.includes(accepterId)) {
            requesterBinUsers[requesterIndex].friends.push(accepterId);
        }

        // PUT to both bins
        const putPromises = [
            fetch(getBinUrl(accepterBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: accepterBinUsers }) })
        ];

        // Only PUT to requester's bin if it's different
        if (accepterBinId !== requesterBinId) {
            putPromises.push(
                fetch(getBinUrl(requesterBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: requesterBinUsers }) })
            );
        }

        await Promise.all(putPromises);

        res.status(200).json({ success: true, message: 'Friend request accepted.' });

    } catch (error) {
        console.error('Error accepting friend request:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Decline or cancel a friend request
app.post('/api/friends/decline', async (req, res) => {
    const { declinerId, requesterId } = req.body;
    if (!declinerId || !requesterId) return res.status(400).json({ success: false, message: 'Missing IDs.' });

    try {
        const userRecords = await fetchAllUserRecords();

        const declinerBinData = findUserAndBin(userRecords, declinerId);
        if (!declinerBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const { binId: declinerBinId, users: declinerBinUsers, userIndex: declinerIndex } = declinerBinData;

        // Remove request from decliner's list
        declinerBinUsers[declinerIndex].friendRequests = (declinerBinUsers[declinerIndex].friendRequests || []).filter(req => req.from !== requesterId);

        // PUT only to the decliner's bin
        await fetch(getBinUrl(declinerBinId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: declinerBinUsers })
        });

        res.status(200).json({ success: true, message: 'Friend request declined.' });

    } catch (error) {
        console.error('Error declining friend request:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- APPLICATION SYSTEM ENDPOINTS ---

// Get the status of a user's application
app.get('/api/applications/status/:userId', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single APPLICATIONS_URL)
    const userId = parseInt(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required.' });

    try {
        const appRes = await fetch(`${APPLICATIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!appRes.ok) throw new Error('Could not fetch applications.');
        const appData = await appRes.json();
        const allApps = (appData.record && appData.record.applications) ? appData.record.applications : [];

        const userApp = allApps.find(app => app.userId === userId);

        if (userApp) {
            res.status(200).json({ success: true, status: userApp.status, retries: userApp.retries || 0 });
        } else {
            res.status(200).json({ success: true, status: 'not_submitted', retries: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Submit a new application
app.post('/api/applications/submit', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single APPLICATIONS_URL)
    const { userId, username, answers } = req.body;
    if (!userId || !username || !answers) return res.status(400).json({ success: false, message: 'Missing application data.' });

    try {
        const appRes = await fetch(`${APPLICATIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!appRes.ok) throw new Error('Could not fetch applications.');
        const appData = await appRes.json();
        let allApps = (appData.record && appData.record.applications) ? appData.record.applications : [];

        const existingAppIndex = allApps.findIndex(app => app.userId === userId);

        if (existingAppIndex > -1) {
            // User is re-applying after denial
            if (allApps[existingAppIndex].status === 'denied' && allApps[existingAppIndex].retries < 2) {
                allApps[existingAppIndex].status = 'pending';
                allApps[existingAppIndex].answers = answers;
                allApps[existingAppIndex].submittedAt = new Date().toISOString();
            } else {
                return res.status(400).json({ success: false, message: 'You already have a pending or accepted application.' });
            }
        } else {
            // New application
            const newApp = { userId, username, answers, status: 'pending', retries: 0, submittedAt: new Date().toISOString() };
            allApps.push(newApp);
        }

        await fetch(APPLICATIONS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ applications: allApps })
        });
        res.status(200).json({ success: true, message: 'Application submitted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Admin decision on an application (UPDATED TO USE ALL BINS)
app.post('/api/applications/decide', async (req, res) => {
    const { targetUserId, decision } = req.body;
    if (!targetUserId || !decision) return res.status(400).json({ success: false, message: 'Missing data.' });

    try {
        // Fetch all necessary data
        const [appRes, userRecords] = await Promise.all([
            fetch(`${APPLICATIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } }),
            fetchAllUserRecords()
        ]);

        if (!appRes.ok) {
            throw new Error('Failed to fetch applications database.');
        }

        const appData = await appRes.json();
        let allApps = appData.record.applications || [];
        const userBinData = findUserAndBin(userRecords, targetUserId);

        const appIndex = allApps.findIndex(app => app.userId === targetUserId);

        if (appIndex === -1) return res.status(404).json({ success: false, message: 'Application not found.' });

        allApps[appIndex].status = decision;
        if (decision === 'denied') {
            allApps[appIndex].retries = (allApps[appIndex].retries || 0) + 1;
        }

        const putPromises = [
            // 1. Save applications change
            fetch(APPLICATIONS_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ applications: allApps }) })
        ];

        // 2. If accepted, update the user in their specific bin
        if (decision === 'accepted' && userBinData) {
            const { binId, users: userBinUsers, userIndex } = userBinData;
            userBinUsers[userIndex].isVerified = true;

            putPromises.push(
                fetch(getBinUrl(binId), { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, 
                    body: JSON.stringify({ users: userBinUsers }) 
                })
            );
        }

        await Promise.all(putPromises);

        res.status(200).json({ success: true, message: `Application ${decision}.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- GAME CREATION WORKFLOW ENDPOINTS ---
const creatorApi = express.Router();

// Check a user's creator status
creatorApi.get('/status/:userId', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single SUBMISSIONS_URL)
    const userId = parseInt(req.params.userId);
    try {
        const submissionsRes = await fetch(`${SUBMISSIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const submissionsData = await submissionsRes.json();
        const allSubmissions = submissionsData.record.submissions || [];

        const userSubmission = allSubmissions.find(s => s.creatorId === userId);

        if (userSubmission) {
            if (userSubmission.status === 'pending') {
                return res.json({ status: 'pending_review' });
            }
            if (userSubmission.status === 'denied') {
                const oneHour = 60 * 60 * 1000;
                if (new Date() - new Date(userSubmission.decidedAt) < oneHour) {
                    return res.json({ status: 'in_cooldown' });
                }
            }
        }
        res.json({ status: 'can_create' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Could not get creator status.' });
    }
});

// Handle the game creation fee (UPDATED TO USE ALL BINS)
creatorApi.post('/pay-fee', async (req, res) => {
    const { userId } = req.body;
    const fee = 1000;

    try {
        const userRecords = await fetchAllUserRecords();
        const userBinData = findUserAndBin(userRecords, userId);

        if (!userBinData) return res.status(404).json({ success: false, message: 'User not found.' });

        const { binId, users: userBinUsers, userIndex: userIndex } = userBinData;

        if (userBinUsers[userIndex].authTokens < fee) return res.status(400).json({ success: false, message: 'Not enough AuthTokens.' });

        userBinUsers[userIndex].authTokens -= fee;

        await fetch(getBinUrl(binId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: userBinUsers })
        });

        res.json({ success: true, message: 'Payment successful!', newAuthTokens: userBinUsers[userIndex].authTokens });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Submit a game for review
creatorApi.post('/submit-game', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single SUBMISSIONS_URL)
    const { creatorId, creatorUsername, name, description, thumbnail, code } = req.body;
    if (!creatorId || !name || !description || !thumbnail || !code) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const submissionsRes = await fetch(`${SUBMISSIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const submissionsData = await submissionsRes.json();
        let allSubmissions = submissionsData.record.submissions || [];

        const newSubmission = {
            id: Date.now(),
            creatorId, creatorUsername, name, description, thumbnail, code,
            status: 'pending',
            submittedAt: new Date().toISOString()
        };

        // Remove old submission from the same user if it exists
        allSubmissions = allSubmissions.filter(s => s.creatorId !== creatorId);
        allSubmissions.push(newSubmission);

        await fetch(SUBMISSIONS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ submissions: allSubmissions })
        });

        res.json({ success: true, message: 'Game submitted for review.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Admin decision on a game
creatorApi.post('/decide-game', async (req, res) => {
    const { adminId, gameId, decision, minPlayers, maxPlayers } = req.body;
    
    try {
        const [submissionsRes, publishedRes] = await Promise.all([
            fetch(`${SUBMISSIONS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } }),
            fetch(`${PUBLISHED_GAMES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } })
        ]);
        const submissionsData = await submissionsRes.json();
        const publishedData = await publishedRes.json();
        let allSubmissions = submissionsData.record.submissions || [];
        let allPublished = publishedData.record.games || [];

        const subIndex = allSubmissions.findIndex(s => String(s.id) === String(gameId));
        if (subIndex === -1) return res.status(404).json({ success: false, message: 'Submission not found.' });

        const submission = allSubmissions[subIndex];
        submission.status = decision;
        submission.decidedAt = new Date().toISOString();

        if (decision === 'approved') {
            const newGame = { ...submission };
            delete newGame.status; 
            newGame.minPlayers = minPlayers || 10;
            newGame.maxPlayers = maxPlayers || 50;
            delete newGame.decidedAt;
            allPublished.push(newGame);
            // FIX: Remove from submissions after approval
            allSubmissions.splice(subIndex, 1);
        }

        // FIX: Structure the PUT request body correctly and await each operation to guarantee completion.
        // Always update the submissions bin.
        await fetch(SUBMISSIONS_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ submissions: allSubmissions }) });

        // If approved, also update the published games bin.
        if (decision === 'approved') {
            await fetch(PUBLISHED_GAMES_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ games: allPublished }) });
        }

        res.json({ success: true, message: `Game has been ${decision}.` });
    } catch (error) {
        console.error("Error in /decide-game:", error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Admin deletes a published game
creatorApi.delete('/delete-game', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single PUBLISHED_GAMES_URL)
    const { adminId, gameId } = req.body;
    
    try {
        const publishedRes = await fetch(`${PUBLISHED_GAMES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const publishedData = await publishedRes.json();
        let allPublished = publishedData.record.games || [];
        const updatedGames = allPublished.filter(g => g.id !== gameId);

        await fetch(PUBLISHED_GAMES_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ games: updatedGames }) });
        res.json({ success: true, message: 'Game deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Admin edits a published game's code
creatorApi.put('/edit-game', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single PUBLISHED_GAMES_URL)
    const { adminId, gameId, code } = req.body;
    
    try {
        const publishedRes = await fetch(`${PUBLISHED_GAMES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const publishedData = await publishedRes.json();
        let allPublished = publishedData.record.games || [];
        const gameIndex = allPublished.findIndex(g => g.id === gameId);

        if (gameIndex === -1) return res.status(404).json({ success: false, message: 'Game not found.' });

        allPublished[gameIndex].code = code;

        await fetch(PUBLISHED_GAMES_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ games: allPublished }) });
        res.json({ success: true, message: 'Game code updated.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Admin edits a published game's player counts & algorithm handler
creatorApi.put('/edit-game-players', async (req, res) => {
    const { adminId, gameId, minPlayers, maxPlayers } = req.body;

    try {
        const publishedRes = await fetch(`${PUBLISHED_GAMES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const publishedData = await publishedRes.json();
        let allPublished = publishedData.record.games || [];
        const gameIndex = allPublished.findIndex(g => String(g.id) === String(gameId));

        if (gameIndex === -1) return res.status(404).json({ success: false, message: 'Game not found.' });

        allPublished[gameIndex].minPlayers = minPlayers;
        allPublished[gameIndex].maxPlayers = maxPlayers;

        await fetch(PUBLISHED_GAMES_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ games: allPublished }) });
        res.json({ success: true, message: 'Game player counts updated.' });
    } catch (error) {
        console.error("Error in /edit-game-players:", error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

app.use('/api/creator', creatorApi);

// --- PUBLIC GAME FETCHING ENDPOINT ---
app.get('/api/games/:id', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single PUBLISHED_GAMES_URL)
    const gameId = parseInt(req.params.id);
    try {
        const publishedRes = await fetch(`${PUBLISHED_GAMES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const publishedData = await publishedRes.json();
        const allPublished = publishedData.record.games || [];
        const game = allPublished.find(g => g.id === gameId);

        if (game) {
            res.json({ success: true, code: game.code });
        } else {
            res.status(404).json({ success: false, message: 'Game not found.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not retrieve game data.' });
    }
});

// --- GAMEPASS PURCHASE ENDPOINT (UPDATED TO USE ALL BINS) ---
app.post('/api/games/purchase-gamepass', async (req, res) => {
    const { userId, gameId, gamepassId, price } = req.body;
    if (!userId || !gameId || !gamepassId || !price) {
        return res.status(400).json({ success: false, message: 'Missing purchase details.' });
    }

    try {
        let gamepassBinUrl;
        if (gameId === 'dodge-the-blocks') {
            gamepassBinUrl = DODGE_GAMEPASS_URL;
        } else if (gameId === 'floor-is-lava') { // Add condition for Floor is Lava
            gamepassBinUrl = FLOORISLAVA_GAMEPASS_URL;
        } else {
            return res.status(404).json({ success: false, message: 'Game not found for gamepass system.' });
        }

        const [userRecords, gamepassRes] = await Promise.all([
            fetchAllUserRecords(),
            fetch(`${gamepassBinUrl}/latest`, { headers: { 'X-Master-Key': API_KEY } })
        ]);

        const gamepassData = await gamepassRes.json();
        let allOwnership = (gamepassData.record && gamepassData.record.ownership) ? gamepassData.record.ownership : [];

        const buyerBinData = findUserAndBin(userRecords, userId);
        const ownerBinData = userRecords.allUsers.find(u => u.username.toLowerCase() === 'madeonice'); // Owner is always 'madeonice'

        if (!buyerBinData) return res.status(404).json({ success: false, message: 'Buyer not found.' });
        if (!ownerBinData) return res.status(500).json({ success: false, message: 'Game owner not found.' });

        const { binId: buyerBinId, users: buyerBinUsers, userIndex: buyerIndex, user: buyer } = buyerBinData;

        if (buyer.authTokens < price) return res.status(400).json({ success: false, message: 'Insufficient AuthTokens.' });

        // Process transaction
        buyerBinUsers[buyerIndex].authTokens -= price;
        
        const ownerCut = Math.floor(price * 0.35);
        const platformCut = Math.floor(price * 0.05);

        // Find and update the owner's bin (assuming madeonice is in the primary bin for simplicity)
        const ownerRecord = findUserAndBin(userRecords, ownerBinData.id);
        if (ownerRecord) {
            ownerRecord.users[ownerRecord.userIndex].authTokens += ownerCut + platformCut;
        }


        // Record gamepass ownership
        const ownershipIndex = allOwnership.findIndex(o => o.userId === userId);
        if (ownershipIndex > -1) {
            if (!allOwnership[ownershipIndex].gamepasses.includes(gamepassId)) {
                allOwnership[ownershipIndex].gamepasses.push(gamepassId);
            }
        } else {
            allOwnership.push({ userId: userId, gamepasses: [gamepassId] });
        }

        // Save all changes
        const savePromises = [
            fetch(getBinUrl(buyerBinId), { 
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify({ users: buyerBinUsers })
            }),
            fetch(gamepassBinUrl, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify({ ownership: allOwnership })
            })
        ];

        // Only save the owner's bin if it's different from the buyer's bin
        if (ownerRecord && ownerRecord.binId !== buyerBinId) {
             savePromises.push(
                fetch(getBinUrl(ownerRecord.binId), { 
                    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                    body: JSON.stringify({ users: ownerRecord.users })
                })
            );
        }

        await Promise.all(savePromises);

        res.json({ success: true, message: 'Purchase successful!', newAuthTokens: buyerBinUsers[buyerIndex].authTokens });

    } catch (error) {
        console.error('Gamepass purchase error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- AUTHDONATE GAMEPASS ENDPOINTS (Refactored for clarity) ---
const authDonateApi = express.Router();

authDonateApi.post('/create', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single AUTHDONATE_GAMEPASS_URL)
    const { userId, name, price } = req.body;
    if (!userId || !name || !price || parseInt(price) <= 0) {
        return res.status(400).json({ success: false, message: 'Missing or invalid data.' });
    }

    try {
        const gpRes = await fetch(`${AUTHDONATE_GAMEPASS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const gpData = await gpRes.json();
        let allGamepasses = (gpData.record && gpData.record.gamepasses) ? gpData.record.gamepasses : [];

        const newGamepass = {
            id: Date.now(),
            ownerId: userId,
            name: name,
            price: parseInt(price)
        };
        allGamepasses.push(newGamepass);

        await fetch(AUTHDONATE_GAMEPASS_URL, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ gamepasses: allGamepasses })
        });
        res.json({ success: true, message: 'Gamepass created successfully!' });
    } catch (error) {
        console.error('AuthDonate create error:', error);
        res.status(500).json({ success: false, message: 'Server error creating gamepass.' });
    }
});

authDonateApi.get('/list/:userId', async (req, res) => {
    // ... (This function remains mostly the same as it only deals with the single AUTHDONATE_GAMEPASS_URL)
    const userId = parseInt(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid User ID.' });
    
    try {
        const gpRes = await fetch(`${AUTHDONATE_GAMEPASS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const gpData = await gpRes.json();
        const allGamepasses = (gpData.record && gpData.record.gamepasses) ? gpData.record.gamepasses : [];
        const userGamepasses = allGamepasses.filter(gp => gp.ownerId === userId);
        res.json({ success: true, gamepasses: userGamepasses });
    } catch (error) {
        console.error('AuthDonate list error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching gamepasses.' });
    }
});

authDonateApi.post('/purchase', async (req, res) => {
    const { buyerId, gamepassId } = req.body;
    if (!buyerId || !gamepassId) return res.status(400).json({ success: false, message: 'Missing data.' });

    try {
        // Fetch all necessary records
        const [userRecords, gpRes, donatedRes, raisedRes] = await Promise.all([
            fetchAllUserRecords(),
            fetch(`${AUTHDONATE_GAMEPASS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } }),
            fetch(`${DONATED_LEADERBOARD_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } }),
            fetch(`${RAISED_LEADERBOARD_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } })
        ]);

        const allGamepasses = (await gpRes.json()).record.gamepasses || [];
        let donatedBoard = (await donatedRes.json()).record.donated || [];
        let raisedBoard = (await raisedRes.json()).record.raised || [];

        const gamepass = allGamepasses.find(gp => gp.id === gamepassId);
        if (!gamepass) return res.status(404).json({ success: false, message: 'Gamepass not found.' });

        // Find users in their respective bins
        const buyerBinData = findUserAndBin(userRecords, buyerId);
        const ownerBinData = findUserAndBin(userRecords, gamepass.ownerId);
        const madeonice = userRecords.allUsers.find(u => u.username.toLowerCase() === 'madeonice');
        const madeoniceBinData = madeonice ? findUserAndBin(userRecords, madeonice.id) : null;

        if (!buyerBinData || !ownerBinData) return res.status(404).json({ success: false, message: 'User not found.' });

        const { binId: buyerBinId, users: buyerBinUsers, userIndex: buyerIndex, user: buyer } = buyerBinData;
        const { binId: ownerBinId, users: ownerBinUsers, userIndex: ownerIndex, user: owner } = ownerBinData;

        if (buyer.authTokens < gamepass.price) return res.status(400).json({ success: false, message: 'Insufficient AuthTokens.' });

        // --- Transaction Logic ---
        const ownerCut = Math.floor(gamepass.price * 0.70);
        const platformCut = gamepass.price - ownerCut;

        buyerBinUsers[buyerIndex].authTokens -= gamepass.price;
        ownerBinUsers[ownerIndex].authTokens += ownerCut;
        
        // Handle platform cut (assumed madeonice gets it)
        if (madeoniceBinData && ownerBinId !== madeoniceBinData.binId) {
            madeoniceBinData.users[madeoniceBinData.userIndex].authTokens += platformCut;
        } else if (madeoniceBinData && ownerBinId === madeoniceBinData.binId) {
            ownerBinUsers[ownerIndex].authTokens += platformCut;
        }

        // --- Leaderboard Logic ---
        let buyerDonatedEntry = donatedBoard.find(u => u.id === buyerId);
        if (buyerDonatedEntry) {
            buyerDonatedEntry.amount += gamepass.price;
        } else {
            donatedBoard.push({ id: buyerId, username: buyer.username, amount: gamepass.price });
        }
        let ownerRaisedEntry = raisedBoard.find(u => u.id === gamepass.ownerId);
        if (ownerRaisedEntry) {
            ownerRaisedEntry.amount += gamepass.price;
        } else {
            raisedBoard.push({ id: gamepass.ownerId, username: owner.username, amount: gamepass.price });
        }

        // --- Save all database changes ---
        const savePromises = [
            // 1. Buyer's bin
            fetch(getBinUrl(buyerBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: buyerBinUsers }) }),
            // 2. Owner's bin
            fetch(getBinUrl(ownerBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: ownerBinUsers }) }),
            // 3. Leaderboards
            fetch(DONATED_LEADERBOARD_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ donated: donatedBoard }) }),
            fetch(RAISED_LEADERBOARD_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ raised: raisedBoard }) })
        ];

        // 4. Madeonice's bin (if different from buyer/owner)
        if (madeoniceBinData && madeoniceBinData.binId !== buyerBinId && madeoniceBinData.binId !== ownerBinId) {
            savePromises.push(
                fetch(getBinUrl(madeoniceBinData.binId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: madeoniceBinData.users }) })
            );
        }

        await Promise.all(savePromises);

        // Broadcast to WebSocket clients
        broadcast({
            type: 'donation',
            buyer: buyer.username,
            seller: owner.username,
            amount: gamepass.price
        });

        res.json({ success: true, message: 'Purchase successful!', newAuthTokens: buyerBinUsers[buyerIndex].authTokens });
    } catch (error) {
        console.error('AuthDonate purchase error:', error);
        res.status(500).json({ success: false, message: 'Server error during purchase.' });
    }
});

app.use('/api/authdonate', authDonateApi);

// --- IMAC.OS WEBSITE ENDPOINTS ---
const imacWebsitesApi = express.Router();

// Create/Update an .imac website
imacWebsitesApi.post('/create', async (req, res) => {
    const { creatorId, creatorUsername, name, htmlContent } = req.body;

    if (!creatorId || !creatorUsername || !name || htmlContent === undefined) {
        return res.status(400).json({ success: false, message: 'Missing website data.' });
    }

    // Ensure name ends with .imac
    if (!name.endsWith('.imac')) {
        return res.status(400).json({ success: false, message: 'Website name must end with ".imac".' });
    }

    try {
        const websitesRes = await fetch(`${IMAC_WEBSITES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!websitesRes.ok) throw new Error('Failed to fetch .imac websites.');
        const websitesData = await websitesRes.json();
        let allWebsites = (websitesData.record && websitesData.record.websites) ? websitesData.record.websites : [];

        const existingIndex = allWebsites.findIndex(site => site.name === name);

        if (existingIndex > -1) {
            // Update existing website
            allWebsites[existingIndex].htmlContent = htmlContent;
            allWebsites[existingIndex].updatedAt = new Date().toISOString();
        } else {
            // Create new website
            const newWebsite = {
                id: Date.now(),
                creatorId,
                creatorUsername,
                name,
                htmlContent,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            allWebsites.push(newWebsite);
        }

        await fetch(IMAC_WEBSITES_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ websites: allWebsites })
        });

        res.status(200).json({ success: true, message: `Website "${name}" saved successfully.` });

    } catch (error) {
        console.error('Error creating/updating .imac website:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Get all .imac websites (for admin)
imacWebsitesApi.get('/all', async (req, res) => {
    try {
        const websitesRes = await fetch(`${IMAC_WEBSITES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!websitesRes.ok) throw new Error('Failed to fetch .imac websites.');
        const websitesData = await websitesRes.json();
        const allWebsites = (websitesData.record && websitesData.record.websites) ? websitesData.record.websites : [];
        res.status(200).json({ success: true, websites: allWebsites });
    } catch (error) {
        console.error('Error fetching all .imac websites:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Get a specific .imac website by name
imacWebsitesApi.get('/:name', async (req, res) => {
    const websiteName = req.params.name;

    try {
        const websitesRes = await fetch(`${IMAC_WEBSITES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!websitesRes.ok) throw new Error('Failed to fetch .imac websites.');
        const websitesData = await websitesRes.json();
        const allWebsites = (websitesData.record && websitesData.record.websites) ? websitesData.record.websites : [];

        const website = allWebsites.find(site => site.name === websiteName);

        if (website) {
            res.status(200).json({ success: true, htmlContent: website.htmlContent });
        } else {
            res.status(404).json({ success: false, message: 'Website not found.' });
        }
    } catch (error) {
        console.error('Error fetching .imac website by name:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// Delete an .imac website (admin only)
imacWebsitesApi.delete('/:name', async (req, res) => {
    // This endpoint will be handled by the client-side admin panel, which will enforce the 'icedout' check.
    // For simplicity, the backend will just perform the deletion if requested.
    // In a real app, you'd add an adminId check here too.
    const websiteName = req.params.name;
    // ... (logic to delete from JSONBin) - this is similar to other PUT operations, filter and PUT back.
    res.status(501).json({ success: false, message: 'Deletion not yet implemented on backend.' }); // Placeholder
});

app.use('/api/imac-websites', imacWebsitesApi);

// --- FLOOR IS LAVA GAMEPASS ENDPOINT ---
const floorIsLavaApi = express.Router();

// Endpoint to purchase the x2 score gamepass
floorIsLavaApi.post('/purchase-score-multiplier', async (req, res) => {
    const { userId } = req.body;
    const price = 2000;
    const creatorUsername = 'jasquire';
    const platformUsername = 'madeonice';

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    try {
        const userRecords = await fetchAllUserRecords();

        const buyerData = findUserAndBin(userRecords, userId);
        if (!buyerData) {
            return res.status(404).json({ success: false, message: 'Buyer not found.' });
        }

        if (buyerData.user.authTokens < price) {
            return res.status(400).json({ success: false, message: 'Insufficient AuthTokens.' });
        }

        // Check if user already owns the gamepass
        if (buyerData.user.gamepasses && buyerData.user.gamepasses['floorislava_x2_score']) {
            return res.status(400).json({ success: false, message: 'You already own this gamepass.' });
        }

        const creatorData = userRecords.allUsers.find(u => u.username.toLowerCase() === creatorUsername);
        const platformOwnerData = userRecords.allUsers.find(u => u.username.toLowerCase() === platformUsername);

        if (!creatorData || !platformOwnerData) {
            return res.status(500).json({ success: false, message: 'Game creator or platform owner account not found.' });
        }

        // --- Transaction Logic ---
        const creatorCut = 1000;
        const platformCut = price - creatorCut;

        // 1. Deduct from buyer
        buyerData.users[buyerData.userIndex].authTokens -= price;

        // 2. Add gamepass to buyer's profile
        if (!buyerData.users[buyerData.userIndex].gamepasses) {
            buyerData.users[buyerData.userIndex].gamepasses = {};
        }
        buyerData.users[buyerData.userIndex].gamepasses['floorislava_x2_score'] = true;

        // 3. Add to creator and platform owner
        const creatorBinData = findUserAndBin(userRecords, creatorData.id);
        if (creatorBinData) {
            creatorBinData.users[creatorBinData.userIndex].authTokens += creatorCut;
        }
        const platformBinData = findUserAndBin(userRecords, platformOwnerData.id);
        if (platformBinData) {
            platformBinData.users[platformBinData.userIndex].authTokens += platformCut;
        }

        // --- Save all database changes ---
        // This is a simplified approach. A real system would use a transaction.
        // We need to PUT to each unique bin that was modified.
        await fetch(getBinUrl(buyerData.binId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: buyerData.users }) });
        if (creatorBinData && creatorBinData.binId !== buyerData.binId) await fetch(getBinUrl(creatorBinData.binId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: creatorBinData.users }) });
        if (platformBinData && platformBinData.binId !== buyerData.binId && platformBinData.binId !== creatorBinData.binId) await fetch(getBinUrl(platformBinData.binId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: platformBinData.users }) });

        res.json({ success: true, message: 'Gamepass purchased successfully!', newAuthTokens: buyerData.user.authTokens });
    } catch (error) {
        console.error('Floor is Lava gamepass purchase error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

app.use('/api/floorislava', floorIsLavaApi);

// --- HANGMAN MULTIPLAYER API ENDPOINTS ---
const hangmanApi = express.Router();

// Helper to get all hangman lobbies
async function getHangmanLobbies() {
    const res = await fetch(`${HANGMAN_LOBBIES_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
    if (!res.ok) throw new Error('Failed to fetch hangman lobbies.');
    const data = await res.json();
    return (data.record && data.record.lobbies) ? data.record.lobbies : [];
}

// Helper to update hangman lobbies
async function updateHangmanLobbies(lobbies) {
    const res = await fetch(HANGMAN_LOBBIES_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify({ lobbies })
    });
    if (!res.ok) throw new Error('Failed to update hangman lobbies.');
}

// Create a new lobby
hangmanApi.post('/create-lobby', async (req, res) => {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ success: false, message: 'User info required.' });

    try {
        let lobbies = await getHangmanLobbies();
        const lobbyCode = Math.floor(1000 + Math.random() * 9000).toString();

        const newLobby = {
            code: lobbyCode,
            host: { id: userId, username },
            guest: null,
            word: '',
            guessedLetters: [],
            wrongGuesses: 0,
            turn: 'host', // 'host' or 'guest'
            state: 'waiting', // 'waiting', 'choosing_word', 'playing', 'finished'
            winner: null
        };

        lobbies.push(newLobby);
        await updateHangmanLobbies(lobbies);

        res.status(201).json({ success: true, lobbyCode });
    } catch (error) {
        console.error('Hangman create lobby error:', error);
        res.status(500).json({ success: false, message: 'Server error creating lobby.' });
    }
});

// Join an existing lobby
hangmanApi.post('/join-lobby', async (req, res) => {
    const { userId, username, lobbyCode } = req.body;
    if (!userId || !username || !lobbyCode) return res.status(400).json({ success: false, message: 'All fields required.' });

    try {
        let lobbies = await getHangmanLobbies();
        const lobbyIndex = lobbies.findIndex(l => l.code === lobbyCode);

        if (lobbyIndex === -1) return res.status(404).json({ success: false, message: 'Lobby not found.' });
        if (lobbies[lobbyIndex].guest) return res.status(400).json({ success: false, message: 'Lobby is full.' });

        lobbies[lobbyIndex].guest = { id: userId, username };
        lobbies[lobbyIndex].state = 'choosing_word';

        await updateHangmanLobbies(lobbies);
        res.status(200).json({ success: true, lobby: lobbies[lobbyIndex] });
    } catch (error) {
        console.error('Hangman join lobby error:', error);
        res.status(500).json({ success: false, message: 'Server error joining lobby.' });
    }
});

// Get the current state of a lobby (for polling)
hangmanApi.get('/lobby/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const lobbies = await getHangmanLobbies();
        const lobby = lobbies.find(l => l.code === code);
        if (lobby) {
            res.status(200).json({ success: true, lobby });
        } else {
            res.status(404).json({ success: false, message: 'Lobby not found.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error fetching lobby state.' });
    }
});

// Set the word for the game (host only)
hangmanApi.post('/set-word', async (req, res) => {
    const { userId, lobbyCode, word } = req.body;
    if (!userId || !lobbyCode || !word) return res.status(400).json({ success: false, message: 'All fields required.' });

    try {
        let lobbies = await getHangmanLobbies();
        const lobbyIndex = lobbies.findIndex(l => l.code === lobbyCode);
        if (lobbyIndex === -1) return res.status(404).json({ success: false, message: 'Lobby not found.' });

        const lobby = lobbies[lobbyIndex];
        if (lobby.host.id !== userId) return res.status(403).json({ success: false, message: 'Only the host can set the word.' });
        if (lobby.state !== 'choosing_word') return res.status(400).json({ success: false, message: 'Game is not in word selection phase.' });

        lobby.word = word.toUpperCase();
        lobby.state = 'playing';
        lobby.turn = 'guest'; // Guest guesses first

        await updateHangmanLobbies(lobbies);
        res.status(200).json({ success: true, message: 'Word set, game started.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error setting word.' });
    }
});

// Make a guess
hangmanApi.post('/guess', async (req, res) => {
    const { userId, lobbyCode, letter } = req.body;
    if (!userId || !lobbyCode || !letter) return res.status(400).json({ success: false, message: 'All fields required.' });

    try {
        let lobbies = await getHangmanLobbies();
        const lobbyIndex = lobbies.findIndex(l => l.code === lobbyCode);
        if (lobbyIndex === -1) return res.status(404).json({ success: false, message: 'Lobby not found.' });

        const lobby = lobbies[lobbyIndex];
        const isHost = lobby.host.id === userId;
        const isGuest = lobby.guest && lobby.guest.id === userId;

        if (lobby.state !== 'playing') return res.status(400).json({ success: false, message: 'Game is not active.' });
        if ((isHost && lobby.turn !== 'host') || (isGuest && lobby.turn !== 'guest')) {
            return res.status(403).json({ success: false, message: "It's not your turn." });
        }

        const upperLetter = letter.toUpperCase();
        if (lobby.guessedLetters.includes(upperLetter)) return res.status(400).json({ success: false, message: 'Letter already guessed.' });

        lobby.guessedLetters.push(upperLetter);

        if (!lobby.word.includes(upperLetter)) {
            lobby.wrongGuesses++;
        }

        // Check for win/loss
        const wordGuessed = lobby.word.split('').every(l => lobby.guessedLetters.includes(l) || l === ' ');
        const maxGuessesReached = lobby.wrongGuesses >= 6;

        if (wordGuessed) {
            lobby.state = 'finished';
            lobby.winner = lobby.turn; // The person who just guessed is the winner
        } else if (maxGuessesReached) {
            lobby.state = 'finished';
            lobby.winner = lobby.turn === 'host' ? 'guest' : 'host'; // The other player wins
        } else {
            // Switch turns if game is not over
            lobby.turn = lobby.turn === 'host' ? 'guest' : 'host';
        }

        await updateHangmanLobbies(lobbies);
        res.status(200).json({ success: true, lobby });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error processing guess.' });
    }
});

// Update leaderboard
hangmanApi.post('/update-leaderboard', async (req, res) => {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ success: false, message: 'User info required.' });

    try {
        const leaderboardRes = await fetch(`${HANGMAN_LEADERBOARD_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        const leaderboardData = await leaderboardRes.json();
        let leaderboard = (leaderboardData.record && leaderboardData.record.wins) ? leaderboardData.record.wins : [];

        const userIndex = leaderboard.findIndex(u => u.id === userId);
        if (userIndex > -1) {
            leaderboard[userIndex].score++;
        } else {
            leaderboard.push({ id: userId, username, score: 1 });
        }

        await fetch(HANGMAN_LEADERBOARD_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ wins: leaderboard })
        });

        res.status(200).json({ success: true, message: 'Leaderboard updated.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error updating leaderboard.' });
    }
});

app.use('/api/hangman', hangmanApi);

// --- MEDIA (TIKTOK/REELS STYLE) API ENDPOINTS ---
const mediaApi = express.Router();

// --- NEW: Bot data for automated comments ---
const botUsernames = ['VideoFan22', 'CoolClips', 'AwesomeVids', 'ReelWatcher', 'DailyDoseOfFun', 'ClipConnoisseur', 'ViralVibes'];
const botComments = [
    'This is amazing!', 'Wow, great video!', 'Love this!', 'So cool!', 'Keep it up!',
    'Best video I\'ve seen all day!', 'Incredible content!', 'You\'ve got a new fan!',
    'This deserves to go viral!', 'Absolutely brilliant!', 'Can\'t stop watching this.'
];
const BOT_USER_ID_START = 90000; // A starting ID for bots to avoid collision

// Helper to get/update videos
async function getMediaVideos() {
    const res = await fetch(`${MEDIA_VIDEOS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
    if (!res.ok) throw new Error('Failed to fetch media videos.');
    const data = await res.json();
    // FIX: Check if data.record exists. If the bin is empty, it might be null.
    if (data && data.record && Array.isArray(data.record.videos)) {
        return data.record.videos; // Return videos if they exist
    }
    return []; // Otherwise, return an empty array to prevent errors
}

async function updateMediaVideos(videos) {
    const res = await fetch(MEDIA_VIDEOS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
        body: JSON.stringify({ videos })
    });
    if (!res.ok) throw new Error('Failed to update media videos.');
}

// Endpoint to upload a new video
mediaApi.post('/upload', upload.single('videoFile'), async (req, res) => {
    const { userId, username, title, description } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No video file was uploaded.' });
    }
    if (!userId || !username || !title) {
        return res.status(400).json({ success: false, message: 'Missing required video data.' });
    }

    try {
        let videos = await getMediaVideos();
        const videoUrl = `${BASE_URL}/uploads/${req.file.filename}`; // Construct the URL to the uploaded file
        const newVideo = {
            id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            creatorId: userId,
            creatorUsername: username,
            videoUrl,
            title,
            description: description.substring(0, 200), // Enforce max length
            views: 0,
            likes: 0,
            comments: [],
            likers: [], // Keep track of who liked
            postedAt: new Date().toISOString(),
            // For view algorithm
            viewsUntilNextLike: Math.floor(Math.random() * (35 - 15 + 1)) + 15,
            likesUntilNextBotComment: Math.floor(Math.random() * (10 - 5 + 1)) + 5 // NEW: For bot comments
        };
        videos.push(newVideo);
        await updateMediaVideos(videos);

        // --- Initialize View Generation ---
        const metaRes = await fetch(`${MEDIA_VIEWS_META_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        let metaData = (await metaRes.json()).record;

        // FIX: If the bin is empty, metaData might be null or an empty object.
        // We need to ensure it has the activeVideos property before we use it.
        if (!metaData || !metaData.activeVideos) {
            metaData = { activeVideos: {} };
        }
        
        const rand = Math.random();
        let tier;
        if (rand < 0.05) { // 5% chance
            tier = 'viral';
        } else if (rand < 0.15) { // 10% chance (0.05 + 0.10)
            tier = 'popular';
        } else { // 85% chance
            tier = 'common';
        }

        metaData.activeVideos[newVideo.id] = {
            tier: tier,
            startTime: Date.now()
        };

        await fetch(MEDIA_VIEWS_META_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify(metaData)
        });

        res.status(201).json({ success: true, message: 'Video posted successfully!', video: newVideo });

    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ success: false, message: 'Server error during upload.' });
    }
});

// Endpoint to get videos for the "For You Page"
mediaApi.get('/foryou', async (req, res) => {
    try {
        // --- NEW: Fetch banned users list ---
        const banListRes = await fetch(`${getBinUrl('68dee250ae596e708f0405de')}/latest`, { headers: { 'X-Master-Key': API_KEY } });
        if (!banListRes.ok) {
            console.error('Could not fetch ban list, serving videos without filtering.');
            // Fallback to not filtering if the ban list is unavailable
        }
        const banData = await banListRes.json();
        const bannedUsernames = (banData.record && banData.record.bannedUsers) ? banData.record.bannedUsers.map(u => u.toLowerCase()) : [];

        // Fetch videos and all user data concurrently
        const [videos, { allUsers }] = await Promise.all([
            getMediaVideos(),
            fetchAllUserRecords()
        ]);
        // --- END NEW ---

        // Create a map for quick lookup of user profile pictures
        const userPfpMap = new Map();
        allUsers.forEach(user => userPfpMap.set(user.id, user.pfp));

        // Add the creator's PFP to each video object
        const videosWithPfp = videos.map(video => ({
            ...video,
            creatorPfp: userPfpMap.get(video.creatorId) || 'https://via.placeholder.com/40' // Default PFP
        }));

        // --- NEW: Filter out videos from banned users ---
        const filteredVideos = videosWithPfp.filter(video => !bannedUsernames.includes(video.creatorUsername.toLowerCase()));

        // Algorithm: Show a random selection of the most viewed videos
        const sortedByViews = filteredVideos.sort((a, b) => b.views - a.views);
        const topVideos = sortedByViews.slice(0, 50);
        const shuffled = topVideos.sort(() => 0.5 - Math.random());
        res.status(200).json({ success: true, videos: shuffled });
    } catch (error) {
        console.error('For You Page error:', error);
        res.status(500).json({ success: false, message: 'Could not fetch videos.' });
    }
});

// Endpoint to like a video
mediaApi.post('/like', async (req, res) => {
    const { userId, videoId } = req.body;
    if (!userId || !videoId) return res.status(400).json({ success: false, message: 'User and video ID required.' });

    try {
        let videos = await getMediaVideos();
        const videoIndex = videos.findIndex(v => v.id === videoId);
        if (videoIndex === -1) return res.status(404).json({ success: false, message: 'Video not found.' });

        const video = videos[videoIndex];
        if (video.likers.includes(userId)) {
            // Unlike
            video.likes = Math.max(0, video.likes - 1);
            video.likers = video.likers.filter(id => id !== userId);
        } else {
            // Like
            video.likes++;
            video.likers.push(userId);

            // --- NEW: Bot Comment Logic ---
            video.likesUntilNextBotComment--;
            if (video.likesUntilNextBotComment <= 0) {
                const botUsername = botUsernames[Math.floor(Math.random() * botUsernames.length)];
                const botCommentText = botComments[Math.floor(Math.random() * botComments.length)];
                const botComment = {
                    id: `cmt_bot_${Date.now()}`,
                    // Assign a unique-ish ID to each bot username
                    userId: BOT_USER_ID_START + botUsernames.indexOf(botUsername),
                    username: botUsername,
                    text: botCommentText,
                    timestamp: new Date().toISOString()
                };
                if (!video.comments) video.comments = [];
                video.comments.push(botComment);
                video.likesUntilNextBotComment = Math.floor(Math.random() * (10 - 5 + 1)) + 5; // Reset for next bot comment
            }
        }

        await updateMediaVideos(videos);
        res.status(200).json({ success: true, video: videos[videoIndex] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Endpoint to comment on a video
mediaApi.post('/comment', async (req, res) => {
    const { userId, username, videoId, text } = req.body;
    if (!userId || !username || !videoId || !text) return res.status(400).json({ success: false, message: 'All fields required.' });

    try {
        let videos = await getMediaVideos();
        const videoIndex = videos.findIndex(v => v.id === videoId);
        if (videoIndex === -1) return res.status(404).json({ success: false, message: 'Video not found.' });

        const newComment = {
            id: `cmt_${Date.now()}`,
            userId,
            username,
            text,
            timestamp: new Date().toISOString()
        };
        videos[videoIndex].comments.push(newComment);

        await updateMediaVideos(videos);
        res.status(201).json({ success: true, video: videos[videoIndex] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Admin endpoint to delete a video
mediaApi.delete('/video/:videoId', async (req, res) => {
    const { adminId } = req.body;
    const { videoId } = req.params;
    if (!(await isAdmin(adminId))) return res.status(403).json({ success: false, message: 'Unauthorized.' });

    try {
        let videos = await getMediaVideos();
        const updatedVideos = videos.filter(v => v.id !== videoId);
        await updateMediaVideos(updatedVideos);
        res.status(200).json({ success: true, message: 'Video deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Admin endpoint to delete a comment
mediaApi.delete('/comment/:videoId/:commentId', async (req, res) => {
    const { adminId } = req.body;
    const { videoId, commentId } = req.params;
    if (!(await isAdmin(adminId))) return res.status(403).json({ success: false, message: 'Unauthorized.' });

    try {
        let videos = await getMediaVideos();
        const videoIndex = videos.findIndex(v => v.id === videoId);
        if (videoIndex === -1) return res.status(404).json({ success: false, message: 'Video not found.' });

        videos[videoIndex].comments = videos[videoIndex].comments.filter(c => c.id !== commentId);
        await updateMediaVideos(videos);
        res.status(200).json({ success: true, message: 'Comment deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// --- NEW: Follow/Unfollow Endpoint ---
mediaApi.post('/follow', async (req, res) => {
    const { followerId, followingId } = req.body;
    if (!followerId || !followingId || followerId === followingId) {
        return res.status(400).json({ success: false, message: 'Invalid follow request.' });
    }

    try {
        const userRecords = await fetchAllUserRecords();
        const followerBinData = findUserAndBin(userRecords, followerId);
        const followingBinData = findUserAndBin(userRecords, followingId);

        if (!followerBinData || !followingBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId: followerBinId, users: followerBinUsers, userIndex: followerIndex } = followerBinData;
        const { binId: followingBinId, users: followingBinUsers, userIndex: followingIndex } = followingBinData;

        // Initialize arrays if they don't exist
        if (!followerBinUsers[followerIndex].following) followerBinUsers[followerIndex].following = [];
        if (!followingBinUsers[followingIndex].followers) followingBinUsers[followingIndex].followers = [];

        const isAlreadyFollowing = followerBinUsers[followerIndex].following.includes(followingId);

        if (isAlreadyFollowing) {
            // Unfollow
            followerBinUsers[followerIndex].following = followerBinUsers[followerIndex].following.filter(id => id !== followingId);
            followingBinUsers[followingIndex].followers = followingBinUsers[followingIndex].followers.filter(id => id !== followerId);
        } else {
            // Follow
            followerBinUsers[followerIndex].following.push(followingId);
            followingBinUsers[followingIndex].followers.push(followerId);
        }

        // Save changes to the respective bins
        await fetch(getBinUrl(followerBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: followerBinUsers }) });
        if (followerBinId !== followingBinId) {
            await fetch(getBinUrl(followingBinId), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify({ users: followingBinUsers }) });
        }

        res.status(200).json({ success: true, isFollowing: !isAlreadyFollowing });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during follow action.' });
    }
});

app.use('/api/media', mediaApi);

// --- BACKGROUND JOB for View & Like Generation ---
setInterval(async () => {
    try {
        const [metaRes, videosRes] = await Promise.all([
            fetch(`${MEDIA_VIEWS_META_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } }),
            fetch(`${MEDIA_VIDEOS_URL}/latest`, { headers: { 'X-Master-Key': API_KEY } })
        ]);
        const metaData = (await metaRes.json()).record || { activeVideos: {} };
        
        // FIX: Safely access the videos array, preventing crash on empty bin.
        const videosData = await videosRes.json();
        let videos = (videosData && videosData.record && Array.isArray(videosData.record.videos)) ? videosData.record.videos : [];

        let hasChanges = false;

        for (const videoId in metaData.activeVideos) {
            const videoMeta = metaData.activeVideos[videoId];
            const videoIndex = videos.findIndex(v => v.id === videoId);
            if (videoIndex === -1) {
                delete metaData.activeVideos[videoId]; // Clean up deleted videos
                hasChanges = true;
                continue;
            }

            const video = videos[videoIndex];
            const timeSincePost = Date.now() - videoMeta.startTime;
            const isInitialPhase = timeSincePost < 600000; // 10 minutes

            let viewsToAdd = 0;
            if (videoMeta.tier === 'viral') {
                viewsToAdd = isInitialPhase ? Math.floor(Math.random() * (15000000 - 65100 + 1)) + 65100 : Math.floor(Math.random() * (600000 - 2604 + 1)) + 2604;
            } else if (videoMeta.tier === 'popular') {
                viewsToAdd = isInitialPhase ? Math.floor(Math.random() * (65000 - 1501 + 1)) + 1501 : Math.floor(Math.random() * (2600 - 66 + 1)) + 66;
            } else { // common
                viewsToAdd = isInitialPhase ? Math.floor(Math.random() * (1500 - 25 + 1)) + 25 : Math.floor(Math.random() * (65 - 1 + 1)) + 1;
            }
            
            // This runs every minute, so we add the per-minute views
            video.views += viewsToAdd;
            video.viewsUntilNextLike -= viewsToAdd;

            while (video.viewsUntilNextLike <= 0) {
                video.likes++;
                const nextThreshold = Math.floor(Math.random() * (35 - 15 + 1)) + 15;
                video.viewsUntilNextLike += nextThreshold;
            }
            hasChanges = true;
        }

        if (hasChanges) {
            await Promise.all([
                updateMediaVideos(videos),
                fetch(MEDIA_VIEWS_META_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY }, body: JSON.stringify(metaData) })
            ]);
            console.log('Updated video views and likes.');
        }
    } catch (error) {
        console.error('Error in background view generation job:', error);
    }
}, 60000); // Run every minute

// server.js (relevant sections only)

// --- SKIN MARKET & INVENTORY API ---

// server.js

// --- SKIN MARKET & INVENTORY API ---

const skinDatabase = {
    // Spooky Pack
    greenie: { id: 'greenie', name: 'Greenie', rarity: 'Common', style: 'color', imageUrl: '#a8e6cf' },
    candy_corn: { id: 'candy_corn', name: 'Candy Corn', rarity: 'Rare', style: 'image', imageUrl: 'https://tse3.mm.bing.net/th/id/OIP.8oJclqSDyXA_LsViAoPIuQAAAA?cb=12&rs=1&pid=ImgDetMain&o=7&rm=3' },
    // Space Pack
    bluey: { id: 'bluey', name: 'Bluey', rarity: 'Common', style: 'color', imageUrl: '#a2d5f2' },
    astronaut: { id: 'astronaut', name: 'Astronaut', rarity: 'Rare', style: 'image', imageUrl: 'https://static.wikia.nocookie.net/blooket/images/f/f3/Astronaut.svg' },
    rainbow_astronaut: { id: 'rainbow_astronaut', name: 'Rainbow Astronaut', rarity: 'Prismatic', style: 'image', imageUrl: 'https://static.wikia.nocookie.net/blooket/images/e/ee/RainbowAstronaut.gif' },
    // Bot Pack
    lil_bot: { id: 'lil_bot', name: 'Lil Bot', rarity: 'Common', style: 'color', imageUrl: 'linear-gradient(45deg, #a1c4fd, #c2e9fb)' },
    mega_bot: { id: 'mega_bot', name: 'Mega Bot', rarity: 'Rare', style: 'image', imageUrl: 'https://static.wikia.nocookie.net/blooket/images/d/d8/MegaBot.svg' }
};

const packOdds = {
    spooky: [
        { skinId: 'greenie', chance: 0.90 },
        { skinId: 'candy_corn', chance: 0.10 }
    ],
    space: [
        { skinId: 'bluey', chance: 0.85 },
        { skinId: 'astronaut', chance: 0.14 },
        { skinId: 'rainbow_astronaut', chance: 0.01 }
    ],
    bot: [
        { skinId: 'lil_bot', chance: 0.90 },
        { skinId: 'mega_bot', chance: 0.10 }
    ]
};

const packCosts = {
    spooky: 125,
    space: 100,
    bot: 125
};

app.post('/api/market/hatch', async (req, res) => {
    const { userId, packId } = req.body;
    const cost = packCosts[packId];

    if (!userId || !packId || !cost) {
        return res.status(400).json({ success: false, message: 'Invalid request.' });
    }

    try {
        // 1. Fetch all user records to find the user and their bin
        const userRecords = await fetchAllUserRecords();
        const userBinData = findUserAndBin(userRecords, userId);

        if (!userBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId, users: userBinUsers, userIndex } = userBinData;

        if (userBinUsers[userIndex].authTokens < cost) {
            return res.status(403).json({ success: false, message: 'Insufficient AuthTokens.' });
        }

        // 2. Perform the transaction
        userBinUsers[userIndex].authTokens -= cost;

        // Roll for the skin
        const packContent = packOdds[packId];
        const random = Math.random();
        let cumulativeChance = 0;
        let rolledSkinId = null;
        for (const item of packContent) {
            cumulativeChance += item.chance;
            if (random <= cumulativeChance) {
                rolledSkinId = item.skinId;
                break;
            }
        }
        if (!rolledSkinId) { // Fallback
            rolledSkinId = packContent[0].skinId;
        }
        const rolledSkin = skinDatabase[rolledSkinId];

        // Initialize skins array if it doesn't exist
        if (!userBinUsers[userIndex].skins) {
            userBinUsers[userIndex].skins = [];
        }

        // Check if skin already exists
        const existingSkinIndex = userBinUsers[userIndex].skins.findIndex(s => s.id === rolledSkinId);
        let isDuplicate = false;
        if (existingSkinIndex > -1) {
            isDuplicate = true;
            userBinUsers[userIndex].skins[existingSkinIndex].count++;
        } else {
            userBinUsers[userIndex].skins.push({ ...rolledSkin, count: 1 });
        }

        // 3. Save the updated user data to their specific bin
        await fetch(getBinUrl(binId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: userBinUsers })
        });

        // 4. Fetch the user's fresh, complete record from the database
        const { allUsers: updatedAllUsers } = await fetchAllUserRecords();
        const finalUser = updatedAllUsers.find(u => u.id === userId);

        // 5. Respond with the authoritative user data
        res.status(200).json({
            success: true,
            message: 'Hatched successfully!',
            skin: rolledSkin,
            isDuplicate: isDuplicate,
            user: finalUser // Send the complete, updated user object
        });

    } catch (error) {
        console.error('Hatch error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});


app.post('/api/skins/equip', async (req, res) => {
    const { userId, skinId } = req.body;
    if (!userId || !skinId) {
        return res.status(400).json({ success: false, message: 'Invalid request.' });
    }

    try {
        // 1. Fetch all user records to find the user and their bin
        const userRecords = await fetchAllUserRecords();
        const userBinData = findUserAndBin(userRecords, userId);

        if (!userBinData) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { binId, users: userBinUsers, userIndex } = userBinData;

        // 2. Validate that the user owns the skin
        const hasSkin = userBinUsers[userIndex].skins && userBinUsers[userIndex].skins.some(s => s.id === skinId);
        if (!hasSkin) {
            return res.status(403).json({ success: false, message: "You don't own this skin." });
        }

        // 3. Equip the skin
        userBinUsers[userIndex].equippedSkin = skinId;

        // 4. Save the updated user data to their specific bin
        await fetch(getBinUrl(binId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: userBinUsers })
        });

        // 5. Fetch the user's fresh, complete record from the database
        const { allUsers: updatedAllUsers } = await fetchAllUserRecords();
        const finalUser = updatedAllUsers.find(u => u.id === userId);
        
        // 6. Respond with the authoritative user data
        res.status(200).json({
            success: true,
            message: 'Skin equipped!',
            user: finalUser // Send the complete, updated user object
        });

    } catch (error) {
        console.error('Equip error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

app.post('/api/skins/equip', async (req, res) => {
    const { userId, skinId } = req.body;
    if (!userId || !skinId) {
        return res.status(400).json({ success: false, message: 'Invalid request.' });
    }

    try {
        const userRecords = await fetchAllUserRecords();
        const userBinData = findUserAndBin(userRecords, userId);
        if (!userBinData) return res.status(404).json({ success: false, message: 'User not found.' });

        const { binId, users, userIndex } = userBinData;
        const hasSkin = (users[userIndex].skins || []).some(s => s.id === skinId);

        if (!hasSkin) {
            return res.status(403).json({ success: false, message: "You don't own this skin." });
        }

        users[userIndex].equippedSkin = skinId;

        await fetch(getBinUrl(binId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify({ users: users })
        });

        res.status(200).json({ success: true, message: 'Skin equipped!', user: users[userIndex] });

    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- Start the server ---
const server = http.createServer(app);

// --- WebSocket Server for AuthDonate & Among Us ---
const wss = new WebSocket.Server({ server });
let players = {};

function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastPlayerUpdate() {
    const playerArray = Object.values(players);
    broadcast({ type: 'update', players: playerArray });
}

setInterval(broadcastPlayerUpdate, 100); 

// --- AMONG US MULTIPLAYER LOGIC ---
const amongUsLobbies = {};

function broadcastToLobby(lobbyCode, message) {
    const lobby = amongUsLobbies[lobbyCode];
    if (!lobby) return;

    const messageStr = JSON.stringify(message);
    lobby.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageStr);
        }
    });
}

function getLobbyList() {
    return Object.values(amongUsLobbies).map(lobby => ({
        code: lobby.code,
        playerCount: lobby.players.length,
        state: lobby.state
    }));
}

function startGame(lobbyCode) {
    const lobby = amongUsLobbies[lobbyCode];
    if (!lobby || lobby.players.length < 2) return;

    lobby.state = 'playing';
    
    // Assign Impostor
    const impostorIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p, index) => {
        p.isImpostor = (index === impostorIndex);
        p.isDead = false;
        p.tasks = []; // Simplified task system
    });

    broadcastToLobby(lobbyCode, { type: 'gameStarted', players: lobby.players });
}

wss.on('connection', ws => {
    let userId = null;
    let lobbyCode = null;

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                // --- AuthDonate Logic ---
                case 'join':
                    if (data.user && data.user.id != null) {
                        userId = data.user.id; 
                        players[userId] = { 
                            ...data.user, 
                            x: 50, 
                            y: 50, 
                            color: `hsl(${Math.random() * 360}, 100%, 70%)` 
                        };
                        broadcastPlayerUpdate();
                    }
                    break;
                case 'move':
                    if (userId && players[userId]) {
                        players[userId].x = data.x;
                        players[userId].y = data.y;
                    }
                    break;

                // --- Among Us Logic ---
                case 'createLobby': {
                    const newLobbyCode = Math.random().toString(36).substring(2, 7).toUpperCase();
                    amongUsLobbies[newLobbyCode] = {
                        code: newLobbyCode,
                        players: [],
                        state: 'waiting', // waiting, playing, meeting
                        tasksCompleted: 0,
                        totalTasks: 10
                    };
                    ws.send(JSON.stringify({ type: 'lobbyCreated', lobbyCode: newLobbyCode }));
                    broadcast({ type: 'lobbyListUpdate', lobbies: getLobbyList() });
                    break;
                }
                case 'joinLobby': {
                    const lobby = amongUsLobbies[data.lobbyCode];
                    if (lobby && lobby.players.length < 10) {
                        lobbyCode = data.lobbyCode;
                        const newPlayer = {
                            id: data.user.id,
                            username: data.user.username,
                            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
                            x: 100, y: 100,
                            ws: ws
                        };
                        lobby.players.push(newPlayer);
                        broadcastToLobby(lobbyCode, { type: 'playerUpdate', players: lobby.players });
                        broadcast({ type: 'lobbyListUpdate', lobbies: getLobbyList() });
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found or is full.' }));
                    }
                    break;
                }
                case 'startGame': {
                    startGame(data.lobbyCode);
                    break;
                }
                case 'playerMove': {
                    const lobby = amongUsLobbies[lobbyCode];
                    if (lobby && lobby.state === 'playing') {
                        const player = lobby.players.find(p => p.id === data.id);
                        if (player) {
                            player.x = data.x;
                            player.y = data.y;
                            broadcastToLobby(lobbyCode, { type: 'playerMoved', id: data.id, x: data.x, y: data.y });
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            console.error("WebSocket message error:", e);
        }
    });

    ws.on('close', () => {
        // Existing AuthDonate logic
        if (userId && players[userId]) {
            delete players[userId];
            broadcastPlayerUpdate();
        }

        // New Among Us logic
        if (lobbyCode && amongUsLobbies[lobbyCode]) {
            const lobby = amongUsLobbies[lobbyCode];
            lobby.players = lobby.players.filter(p => p.ws !== ws);
            if (lobby.players.length === 0) {
                delete amongUsLobbies[lobbyCode];
            } else {
                broadcastToLobby(lobbyCode, { type: 'playerUpdate', players: lobby.players });
            }
            broadcast({ type: 'lobbyListUpdate', lobbies: getLobbyList() });
        }
    });

    // Send initial lobby list on connection
    ws.send(JSON.stringify({ type: 'lobbyListUpdate', lobbies: getLobbyList() }));
});

server.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    console.log(`WebSocket server is also running on ws://localhost:${PORT}`);
});
