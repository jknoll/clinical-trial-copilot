# TODO
I've added a file clinical-trials-dataset.md
 which includes information about the availability of the clinical trials dataset. I want to modify this application so that the dialog with the agent is contained on the right-hand side of the browser view and the left-hand side of the view contains metadata about all of the clinical trials, which are currently within the selection criteria.

At first, it should contain metadata about all clinical trials, and as the user provides incremental answers, it should query the database to identify the set of still matching clinical trials. The left-hand data pane should include information such as a map with a breakdown of the location of the clinical trials within the United States. Note also that we should ask for geolocation permission from the user in order to automatically filter in concert with their answer regarding how far they are willing to travel. We should also include a breakdown of the total number of trials and the number in the targeted set as an N/M metric. 

