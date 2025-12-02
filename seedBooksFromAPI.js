import mongoose from "mongoose";
import "dotenv/config";
import Book from "./src/models/Book.js";
import User from "./src/models/User.js";

// Function to fetch random users from RandomUser API
const fetchRandomUsers = async (count = 20) => {
  try {
    const response = await fetch(`https://randomuser.me/api/?results=${count}`);
    const data = await response.json();

    if (!data.results) return [];

    return data.results.map((user) => ({
      username: user.login.username,
      email: user.email,
      password: "password123", // Default password for all seeded users
      profileImage: user.picture.large,
    }));
  } catch (error) {
    console.error("Error fetching random users:", error.message);
    return [];
  }
};

// Function to fetch books from Google Books API
const fetchGoogleBooks = async (query, maxResults = 10) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=${maxResults}`
    );
    const data = await response.json();

    if (!data.items) return [];

    return data.items.map((item) => ({
      title: item.volumeInfo.title || "Unknown Title",
      author: item.volumeInfo.authors?.[0] || "Unknown Author",
      year: item.volumeInfo.publishedDate
        ? new Date(item.volumeInfo.publishedDate).getFullYear()
        : new Date().getFullYear(),
      description:
        item.volumeInfo.description ||
        `A fascinating book about ${item.volumeInfo.title}`,
      image:
        item.volumeInfo.imageLinks?.thumbnail ||
        item.volumeInfo.imageLinks?.smallThumbnail ||
        `https://via.placeholder.com/400x600/2c3e50/ffffff?text=${encodeURIComponent(
          item.volumeInfo.title
        )}`,
      categories: item.volumeInfo.categories || [query],
      source: "Google Books",
    }));
  } catch (error) {
    console.error(
      `Error fetching from Google Books (${query}):`,
      error.message
    );
    return [];
  }
};

// Function to fetch books from Open Library API
const fetchOpenLibraryBooks = async (subject, limit = 10) => {
  try {
    const response = await fetch(
      `https://openlibrary.org/subjects/${subject}.json?limit=${limit}`
    );
    const data = await response.json();

    if (!data.works) return [];

    return data.works.map((work) => ({
      title: work.title || "Unknown Title",
      author: work.authors?.[0]?.name || "Unknown Author",
      year: work.first_publish_year || new Date().getFullYear(),
      description: work.subject
        ? `A captivating book exploring ${work.subject.slice(0, 3).join(", ")}`
        : `An interesting read about ${work.title}`,
      image: work.cover_id
        ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg`
        : `https://via.placeholder.com/400x600/34495e/ffffff?text=${encodeURIComponent(
            work.title
          )}`,
      categories: work.subject
        ? work.subject.slice(0, 3)
        : [subject.replace(/_/g, " ")],
      source: "Open Library",
    }));
  } catch (error) {
    console.error(
      `Error fetching from Open Library (${subject}):`,
      error.message
    );
    return [];
  }
};

// Function to fetch books from Gutendex API
const fetchGutendexBooks = async (search = "", page = 1) => {
  try {
    const url = search
      ? `https://gutendex.com/books/?search=${search}&page=${page}`
      : `https://gutendex.com/books/?page=${page}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.results) return [];

    return data.results.map((book) => {
      // Extract meaningful categories from subjects
      const categories =
        book.subjects?.length > 0
          ? book.subjects.slice(0, 3).map(
              (s) => s.split("--")[0].trim() // Get main category before '--'
            )
          : ["Classic Literature"];

      return {
        title: book.title || "Unknown Title",
        author: book.authors?.[0]?.name || "Unknown Author",
        year: book.authors?.[0]?.birth_year || new Date().getFullYear(),
        description:
          book.subjects?.length > 0
            ? `A classic work exploring themes of ${book.subjects
                .slice(0, 2)
                .join(" and ")}`
            : `A timeless classic: ${book.title}`,
        image:
          book.formats?.["image/jpeg"] ||
          `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.cover.medium.jpg` ||
          `https://via.placeholder.com/400x600/16a085/ffffff?text=${encodeURIComponent(
            book.title
          )}`,
        categories: categories,
        source: "Gutendex",
      };
    });
  } catch (error) {
    console.error(`Error fetching from Gutendex:`, error.message);
    return [];
  }
};

// Function to generate random rating between 3-5
const getRandomRating = () => Math.floor(Math.random() * 3) + 3;

// Main seed function
const seedBooksFromAPIs = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Database connected successfully\n");

    // Clear existing data
    await Book.deleteMany({});
    await User.deleteMany({});
    console.log("🗑️  Cleared existing books and users\n");

    // Fetch and create random users
    console.log("👥 Fetching random users from RandomUser API...");
    const randomUsersData = await fetchRandomUsers(20);

    const createdUsers = await User.insertMany(randomUsersData);
    console.log(`✅ Created ${createdUsers.length} random users\n`);

    // Display sample users
    console.log("👤 Sample Users:");
    createdUsers.slice(0, 5).forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.username} - ${user.email}`);
    });
    console.log();

    // Fetch books from multiple APIs
    console.log("🔍 Fetching books from APIs...\n");

    const allBooks = [];

    // Google Books - different genres
    console.log("📖 Fetching from Google Books API...");
    const googleQueries = [
      "fiction",
      "science",
      "history",
      "fantasy",
      "romance",
    ];
    for (const query of googleQueries) {
      const books = await fetchGoogleBooks(query, 4);
      allBooks.push(...books);
      console.log(`  ✓ Found ${books.length} books for "${query}"`);
    }

    // Open Library - different subjects
    console.log("\n📚 Fetching from Open Library API...");
    const openLibrarySubjects = [
      "science_fiction",
      "adventure",
      "mystery",
      "thriller",
    ];
    for (const subject of openLibrarySubjects) {
      const books = await fetchOpenLibraryBooks(subject, 5);
      allBooks.push(...books);
      console.log(`  ✓ Found ${books.length} books for "${subject}"`);
    }

    // Gutendex - classic literature
    console.log("\n📕 Fetching from Gutendex API...");
    const gutendexSearches = ["love", "adventure", ""];
    for (const search of gutendexSearches) {
      const books = await fetchGutendexBooks(search, 1);
      allBooks.push(...books);
      console.log(
        `  ✓ Found ${books.length} classic books${
          search ? ` for "${search}"` : ""
        }`
      );
    }

    console.log(`\n📊 Total books fetched: ${allBooks.length}`);

    // Remove duplicates based on title
    const uniqueBooks = allBooks.filter(
      (book, index, self) =>
        index === self.findIndex((b) => b.title === book.title)
    );

    console.log(`📊 Unique books after deduplication: ${uniqueBooks.length}\n`);

    // Assign random users to books
    const booksToCreate = uniqueBooks.map((book, index) => {
      // Distribute books evenly among users
      const randomUser = createdUsers[index % createdUsers.length];

      return {
        title: book.title,
        caption: `${book.description.substring(0, 200)}${
          book.description.length > 200 ? "..." : ""
        } — ${book.author} (${book.year})`,
        image: book.image,
        categories: book.categories,
        rating: getRandomRating(),
        user: randomUser._id,
      };
    });

    const createdBooks = await Book.insertMany(booksToCreate);

    console.log(`\n✅ Successfully created ${createdBooks.length} books!\n`);

    // Display summary by source
    const summary = uniqueBooks.reduce((acc, book) => {
      acc[book.source] = (acc[book.source] || 0) + 1;
      return acc;
    }, {});

    console.log("📊 Books by Source:");
    Object.entries(summary).forEach(([source, count]) => {
      console.log(`  • ${source}: ${count} books`);
    });

    // Display sample books
    console.log("\n📖 Sample Books Created:");
    createdBooks.slice(0, 10).forEach((book, index) => {
      const bookUser = createdUsers.find(
        (u) => u._id.toString() === book.user.toString()
      );
      console.log(`  ${index + 1}. "${book.title}" - ⭐ ${book.rating}/5`);
      console.log(`     Categories: ${book.categories.join(", ")}`);
      console.log(`     Recommended by: ${bookUser?.username || "Unknown"}`);
    });

    if (createdBooks.length > 10) {
      console.log(`  ... and ${createdBooks.length - 10} more books!\n`);
    }

    // Display user stats
    console.log("\n📊 Books per User:");
    const userStats = {};
    createdBooks.forEach((book) => {
      const userId = book.user.toString();
      userStats[userId] = (userStats[userId] || 0) + 1;
    });

    Object.entries(userStats)
      .slice(0, 5)
      .forEach(([userId, count]) => {
        const user = createdUsers.find((u) => u._id.toString() === userId);
        console.log(`  • ${user?.username || "Unknown"}: ${count} books`);
      });

    console.log(`\n🎉 Seeding completed successfully!`);
    console.log(`   👥 ${createdUsers.length} users created`);
    console.log(`   📚 ${createdBooks.length} books created\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error seeding books:", error);
    process.exit(1);
  }
};

// Run the seed function
seedBooksFromAPIs();
