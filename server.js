const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "http://0.0.0.0:5173",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
});
const mongoose = require("mongoose");
const path = require("path");
const { Question, seedQuestions } = require("./models/question.model");
const Game = require("./models/game.model");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Conectar a MongoDB
mongoose
  .connect("mongodb://localhost/dots-go")
  .then(() => {
    console.log("Conectado a MongoDB");
    seedQuestions(); // Inicializar preguntas
  })
  .catch((err) => console.error("Error conectando a MongoDB:", err));

// Función para generar PIN aleatorio
const generatePin = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

io.on("connection", (socket) => {
  console.log("Socket conectado:", socket.id);

  socket.on("create-game", async (gameData, callback) => {
    try {
      const { timeLimit } = gameData;
      const pin = generatePin();
      const questions = await Question.find();

      const game = new Game({
        pin,
        timeLimitPerQuestion: timeLimit * 1000, // En milisegundos
        hostId: socket.id,
        questions: questions.map((q) => q._id),
        status: "waiting",
      });

      await game.save();
      socket.join(pin);

      callback({ success: true, pin });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("join-game", async ({ pin, username }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      // Si el juego ya está en progreso, envía la pregunta actual y el tiempo restante
      if (game.status === "playing") {
        const currentQuestion = game.questions[game.currentQuestion];
        const timeElapsed = Date.now() - game.questionStartTime;
        const timeRemaining = Math.max(
          0,
          Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000)
        );

        socket.emit("game-started", {
          question: currentQuestion,
          timeLimit: timeRemaining, // Tiempo en segundos
        });
      }

      if (game.status === "waiting") {
        game.players.push({
          id: socket.id,
          username,
          score: 0,
        });
        await game.save();
        socket.join(pin);
        io.to(pin).emit("player-joined", { players: game.players });
        console.log("Jugador conectado:", username, socket.id);
      }

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("start-game", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status !== "waiting") {
        return callback({ success: false, error: "El juego ya ha comenzado" });
      }

      game.status = "playing";
      game.currentQuestion = 0;
      game.questionStartTime = Date.now(); // Agrega el tiempo de inicio de la pregunta
      await game.save();

      // Dentro de emitQuestion en el backend
      const emitQuestion = async (questionIndex) => {
        if (questionIndex >= game.questions.length) {
          game.status = "finished";
          await game.save();
          io.to(pin).emit("game-ended", { message: "El juego ha terminado" });
          return;
        }

        const question = game.questions[questionIndex];
        game.questionStartTime = Date.now();
        const nextQuestionTime = game.questionStartTime + game.timeLimitPerQuestion;
        await game.save();

        io.to(pin).emit("game-started", {
          question: question,
          timeLimit: game.timeLimitPerQuestion / 1000,
          nextQuestionTime,
        });

        setTimeout(() => {
          game.currentQuestion += 1;
          game.save().then(() => {
            emitQuestion(game.currentQuestion);
          });
        }, game.timeLimitPerQuestion);
      };


      emitQuestion(game.currentQuestion);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // Nuevo evento para que los jugadores puedan solicitar la pregunta actual y el tiempo restante
  socket.on("request-current-question", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status === "playing") {
        const currentQuestion = game.questions[game.currentQuestion];
        const timeElapsed = Date.now() - game.questionStartTime;
        const timeRemaining = Math.max(
          0,
          Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000)
        );

        callback({
          success: true,
          question: currentQuestion,
          timeLeft: timeRemaining,
        });
      } else {
        callback({ success: false, error: "El juego aún no ha comenzado" });
      }
    } catch (error) {
      console.error("Error al manejar request-current-question:", error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on("submit-answer", async ({ pin, answer, responseTime }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");
  
      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }
      if (game.status !== "playing") {
        return callback({ success: false, error: "Juego no válido" });
      }
  
      const currentQuestion = game.questions[game.currentQuestion];
      const player = game.players.find((p) => p.id === socket.id);
  
      if (!player) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }
  
      // Lógica de verificación de respuesta
      let isCorrect = true;
      const correctAnswer = currentQuestion.correctAnswer;
  
      // Verificar pictograma
      if (answer.pictogram !== correctAnswer.pictogram) {
        isCorrect = false;
      }
  
      // Verificar número
      if (answer.number !== correctAnswer.number) {
        isCorrect = false;
      }
  
      // Verificar colores (sin importar el orden)
      const answerColors = Array.isArray(answer.colors) ? answer.colors : [];
      const correctColors = new Set(
        Array.isArray(correctAnswer.colors) ? correctAnswer.colors : []
      );
      if (
        answerColors.length !== correctColors.size ||
        !answerColors.every((color) => correctColors.has(color))
      ) {
        isCorrect = false;
      }
  
      // Cálculo de puntos basado en el tiempo restante
      let pointsAwarded = 0;
      if (isCorrect) {
        const timeLimit = game.timeLimitPerQuestion;
        const timeFactor = (timeLimit - responseTime) / timeLimit;
        pointsAwarded = Math.floor(100 * timeFactor); // Calcula puntos en función del tiempo
  
        player.score += pointsAwarded;
        await game.save();
      }
  
      // Registro en consola de los resultados de cada respuesta
      console.log(`Respuesta del jugador ${player.username} (ID: ${socket.id}):`);
      console.log(`- Pregunta: ${currentQuestion.title}`);
      console.log(`- Respuesta correcta: ${isCorrect ? "Sí" : "No"}`);
      console.log(`- Puntos otorgados: ${pointsAwarded}`);
      console.log(`- Puntaje total del jugador: ${player.score}`);
      console.log("----------------------------");
  
      callback({ success: true, isCorrect, pointsAwarded });
  
      // Notificar a todos los jugadores de la respuesta
      io.to(pin).emit("player-answered", {
        playerId: socket.id,
        isCorrect,
        pointsAwarded,
        playerScore: player.score,
      });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
  

  socket.on("disconnect", async () => {
    try {
      const game = await Game.findOne({
        "players.id": socket.id,
      });

      if (game) {
        game.players = game.players.filter((p) => p.id !== socket.id);
        await game.save();

        io.to(game.pin).emit("player-left", {
          playerId: socket.id,
          players: game.players,
        });
      }
    } catch (error) {
      console.error("Error en disconnect:", error);
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
