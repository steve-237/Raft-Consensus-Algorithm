<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <title>Application Test</title>
    </head>
    <body>
        <h2>Operation</h2>
        <form action="index.php" method="post">
            Number 1: <input type="text" name="number1"><br>
            Number 2: <input type="text" name="number2"><br>
            Operation:
            <select name="operation">
                <option value="addition">Addition</option>
                <option value="multiplication">Multiplication</option>
            </select>
            <input type="submit" value="Submit">
        </form>

        <?php
            if($_SERVER["REQUEST_METHOD"] == "POST") {
                $servername = "localhost";
                $username = "testuser";
                $password = "test";
                $dbname = "testapp";

                $conn = new mysqli($servername, $username, $password, $dbname);

                if($conn->connect_error) {
                    die("Connection failed: " . $conn->connect_error);
                }

                $number1 = isset($_POST['number1']) ? (int)$_POST['number1'] : 0;
                $number2 = isset($_POST['number2']) ? (int)$_POST['number2'] : 0;
                $operation = isset($_POST['operation']) ? $_POST['operation'] : 'addition';

                $result = 0;

                if($operation == 'addition') {
                    $result = $number1 + $number2;
                } elseif ($operation == 'multiplication') {
                    $result = $number1 * $number2;
                }

                $query = sprintf("INSERT INTO results (result) VALUES (%d)", $result);
                if ($conn->query($query) === TRUE) {
                    echo "<br> Operation successfully performed! Result: $result <br>";
                } else {
                    echo "Error: " . $conn->error;
                }
                $conn->close();
            }   
        ?>

        <h2>Retrieve Result by ID</h2>
        <form action="index.php" method="get">
            Enter an ID: <input type="text" name="id"><br>
            <input type="submit" value="Retrieve">
        </form>

        <?php
            if($_SERVER["REQUEST_METHOD"] == "GET" && isset($_GET['id'])) {
                $servername = "localhost";
                $username = "testuser";
                $password = "test";
                $dbname = "testapp";

                $conn = new mysqli($servername, $username, $password, $dbname);

                if($conn->connect_error) {
                    die("Connection failed: " . $conn->connect_error);
                }

                $id = (int)$_GET['id'];
                $sql = "SELECT result FROM results WHERE id = $id";
                $result = $conn->query($sql);

                if($result->num_rows > 0) {
                    while($row = $result->fetch_assoc()) {
                        echo "<br> Result ID $id: " . $row["result"] . "<br>";
                    }
                } else {
                    echo "Result not found. <br>";
                }

                $conn->close();
            }   
        ?>
    </body>
</html>