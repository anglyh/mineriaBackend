const express = require("express");
const app = express();
const http = require("http").createServer(app);
const cors = require("cors"); // Importa el paquete cors

const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
});
const mongoose = require("mongoose");
const path = require("path");
const { Question, seedQuestions } = require("./models/question.model");
const Game = require("./models/game.model");
const questionController = require('./controllers/questionController');
app.use(cors());


app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get('/api/questions', questionController.getAllQuestions);

mongoose  
  .connect("mongodb://localhost/dots-go")
  .then(() => {
    console.log("Conectado a MongoDB");
    seedQuestions();
  })
  .catch((err) => console.error("Error conectando a MongoDB:", err));

const generatePin = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const registerTimeoutAnswer = async (game, playerId) => {
  try {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    const currentQuestionId = game.questions[game.currentQuestion]._id.toString();
    const hasAnswered = player.answers.some(a => a.questionId.toString() === currentQuestionId);

    if (hasAnswered) return; // Evita duplicar respuestas

    player.answers.push({
      questionId: currentQuestionId,
      givenAnswer: { pictogram: "", colors: [], number: "" },
      isCorrect: false,
      pointsAwarded: 0,
    });

    await game.save();

    io.to(game.pin).emit("player-answered", {
      playerId: player.id,
      isCorrect: false,
      pointsAwarded: 0,
      playerScore: player.score,
    });
  } catch (error) {
    console.error("Error al registrar timeout:", error);
  }
};

const processTimeouts = async (game) => {
  const currentPlayers = game.players.map(p => p.id);
  for (const playerId of currentPlayers) {
    await registerTimeoutAnswer(game, playerId);
  }
};

// Definir emitQuestion como una función independiente
const emitQuestion = async (game, questionIndex) => {
  if (questionIndex >= game.questions.length) {
    endGame(game, game.pin);
    return;
  }

  const question = game.questions[questionIndex];
  game.questionStartTime = Date.now();
  await game.save();

  io.to(game.pin).emit("game-started", {
    question: question,
    timeLimit: game.timeLimitPerQuestion / 1000,
  });

  setTimeout(async () => {
    const updatedGame = await Game.findById(game._id).populate("questions");
    if (updatedGame && updatedGame.status === "playing") {
      await processTimeouts(updatedGame); // Procesar timeouts
      updatedGame.currentQuestion += 1;
      await updatedGame.save();
      emitQuestion(updatedGame, updatedGame.currentQuestion); // Llamada recursiva
    }
  }, game.timeLimitPerQuestion);
};

io.on("connection", (socket) => {
  console.log("Socket conectado:", socket.id);

  socket.on("create-game", async (gameData, callback) => {
    try {
      const { timeLimit , questionIds} = gameData;
      const pin = generatePin();
      const questions = await Question.find({ '_id': { $in: questionIds } });

      const game = new Game({
        pin,
        timeLimitPerQuestion: timeLimit * 1000,
        hostId: socket.id,
        questions: questions.map(q => q._id),
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

      if (game.status === "playing") {
        const currentQuestion = game.questions[game.currentQuestion];
        const timeElapsed = Date.now() - game.questionStartTime;
        const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));

        socket.emit("game-started", {
          question: currentQuestion,
          timeLimit: timeRemaining,
        });
      }

      if (game.status === "waiting") {
        game.players.push({
          id: socket.id,
          username,
          score: 0,
          correctAnswers: 0,
          answers: [],
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
      game.questionStartTime = Date.now();
      await game.save();
  
      // Inicia el ciclo de preguntas
      emitQuestion(game, game.currentQuestion);
  
      callback({ success: true });
    } catch (error) {
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
      const player = game.players.find(p => p.id === socket.id);

      if (!player) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }

      const isEmptyAnswer = !answer.pictogram && (!answer.colors || answer.colors.length === 0) && !answer.number;
      let isCorrect = false;

      if (!isEmptyAnswer) {
        isCorrect = true;
        const correctAnswer = currentQuestion.correctAnswer;

        if (answer.pictogram !== correctAnswer.pictogram) isCorrect = false;
        if (answer.number !== correctAnswer.number) isCorrect = false;

        const answerColors = Array.isArray(answer.colors) ? answer.colors : [];
        const correctColors = new Set(Array.isArray(correctAnswer.colors) ? correctAnswer.colors : []);
        if (answerColors.length !== correctColors.size || !answerColors.every(color => correctColors.has(color))) {
          isCorrect = false;
        }
      }

      let pointsAwarded = 0;
      if (isCorrect) {
        const timeFactor = (game.timeLimitPerQuestion - (responseTime*1000)) / game.timeLimitPerQuestion;
        pointsAwarded = Math.floor(100 * timeFactor);
        player.score += pointsAwarded;
        player.correctAnswers += 1;
      }

      player.answers.push({
        questionId: currentQuestion._id,
        givenAnswer: answer,
        isCorrect,
        pointsAwarded,
      });

      await game.save();

      console.log(`Jugador ${player.username} (ID: ${socket.id}) - Correcta: ${isCorrect} - Puntos: ${pointsAwarded} - Total: ${player.score}`);

      callback({ success: true, isCorrect, pointsAwarded });

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
      const game = await Game.findOne({ "players.id": socket.id });

      if (game) {
        game.players = game.players.filter(p => p.id !== socket.id);
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

const endGame = async (game, pin) => {
  game.status = "finished";
  await game.save();

  const updatedGame = await Game.findById(game._id);
  const totalQuestions = updatedGame.questions.length;

  const results = updatedGame.players.map(player => ({
    username: player.username,
    score: player.score || 0,
    correctAnswers: player.correctAnswers || 0,
    totalQuestions,
  }));

  console.log("Resultados finales enviados desde el backend:", results);
  io.to(pin).emit("game-ended", { results });
};

const PORT = process.env.PORT || 80;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
