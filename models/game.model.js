const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  pin: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  players: [{
    id: String,
    username: String,
    score: {
      type: Number,
      default: 0
    }
  }],
  currentQuestion: {
    type: Number,
    default: -1
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
  timeLimitPerQuestion: {
    type: Number,
    required: true
  }
});

const Game = mongoose.model('Game', gameSchema);
module.exports = Game;
