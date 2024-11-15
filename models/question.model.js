const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: String,
  correctAnswer: {
    pictogram: String,
    colors: [String],
    number: Number
  }
});

const Question = mongoose.model('Question', questionSchema);

const seedQuestions = async () => {
  const questionsData = [
    {
      title: "Explosivos",
      correctAnswer: {
        pictogram: "explosivo",
        colors: ["orange", "black"],
        number: 1
      }
    },
    {
      title: "Radioactivos",
      correctAnswer: {
        pictogram: "radioactivo",
        colors: ["white", "yellow", "black"],
        number: 7
      }
    },
    {
      title: "Peroxido Organico",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["red", "yellow", "black"],
        number: 5.2
      }
    },
    {
      title: "Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["yellow", "black"],
        number: 5.1
      }
    },
    {
      title: "Gas Inflamable",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["red", "white", "black"],
        number: 2
      }
    },
    {
      title: "Baterias de Litio",
      correctAnswer: {
        pictogram: "baterias",
        colors: ["white", "black"],
        number: 9
      }
    },
    {
      title: "Gas Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["yellow", "black"],
        number: 2
      }
    },
    {
      title: "Miscelaneos",
      correctAnswer: {
        pictogram: "triangulo",
        colors: ["white", "black"],
        number: 9
      }
    },
    {
      title: "Corrosivos",
      correctAnswer: {
        pictogram: "corrosivo",
        colors: ["white", "black"],
        number: 8
      }
    },
    {
      title: "Sustancias toxicas",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["white", "black"],
        number: 6
      }
    },
    {
      title: "Sustancia infecciosa",
      correctAnswer: {
        pictogram: "riesgoBiologico",
        colors: ["white", "black"],
        number: 6
      }
    },
    {
      title: "Gas no inflamable",
      correctAnswer: {
        pictogram: "botella",
        colors: ["green", "black", "white"],
        number: 2
      }
    },
    {
      title: "Gases toxicos",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["white", "black"],
        number: 2
      }
    },
    {
      title: "Solidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["red", "white", "black"],
        number: 4
      }
    },
    {
      title: "Liquidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["red", "white", "black"],
        number: 3
      }
    },
    {
      title: "Solidos que reaccionan con el agua",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["blue", "black", "white"],
        number: 4
      }
    },
    {
      title: "Solidos de combustion espontanea",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["white", "red", "black"],
        number: 4
      }
    }
  ];

  try {
    await Question.deleteMany({}); // Limpia preguntas existentes
    await Question.insertMany(questionsData);
    console.log('Preguntas inicializadas correctamente');
  } catch (error) {
    console.error('Error al inicializar preguntas:', error);
  }
};

module.exports = { Question, seedQuestions };