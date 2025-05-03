const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

let usersCount = 0;

// Handle socket connections
io.on('connection', (socket) => {
    usersCount++;
    io.emit('usersCount', usersCount); // Broadcast updated user count
    console.log('A user connected:', socket.id);

    // Listen for drawing data from clients
    socket.on('draw', (data) => {
        // Broadcast the drawing data to all other clients
        socket.broadcast.emit('draw', data);
    });

    // Handle clear canvas event
    socket.on('clear', () => {
        socket.broadcast.emit('clear');
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        usersCount--;
        io.emit('usersCount', usersCount); // Broadcast updated user count
        console.log('A user disconnected:', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});