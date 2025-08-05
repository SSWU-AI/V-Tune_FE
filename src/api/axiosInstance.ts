import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'https://v-tune-be.onrender.com', // URL -> 백엔드 배포 주소
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default axiosInstance;
